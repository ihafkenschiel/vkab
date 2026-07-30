import { useEffect, useMemo, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { obtainLearnerSession } from "./session";
import {
  browserTranslationClient,
  type TranslationClient,
  type TranslationResponse,
} from "./translation-client";
import { validateTranslationInput } from "./translation";
import type { LanguageCode } from "./translation";
import {
  readLanguageDirection,
  writeLanguageDirection,
  type DirectionStorage,
} from "./language-direction";
import {
  createSupabaseVocabularyRepository,
  type VocabularyEntry,
  type VocabularyRepository,
} from "./vocabulary-repository";

interface AppProps {
  supabase: SupabaseClient;
  translationClient?: TranslationClient;
  directionStorage?: DirectionStorage;
  vocabularyRepository?: VocabularyRepository;
}

export function App({
  supabase,
  translationClient = browserTranslationClient,
  directionStorage = window.localStorage,
  vocabularyRepository,
}: AppProps) {
  const activeVocabularyRepository = useMemo(
    () =>
      vocabularyRepository ?? createSupabaseVocabularyRepository(supabase),
    [supabase, vocabularyRepository],
  );
  const [sessionStatus, setSessionStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [attempt, setAttempt] = useState(0);
  const [activeView, setActiveView] = useState<"translate" | "vocabulary">(
    "translate",
  );
  const [learnerSession, setLearnerSession] = useState<Session | null>(null);
  const [text, setText] = useState("");
  const [translation, setTranslation] = useState<
    | (TranslationResponse & {
        originalText: string;
        sourceLanguage: LanguageCode;
        targetLanguage: LanguageCode;
      })
    | null
  >(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const saveAttemptRef = useRef(0);
  const [direction, setDirection] = useState(() =>
    readLanguageDirection(directionStorage),
  );
  const [vocabularyState, setVocabularyState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    entries: VocabularyEntry[];
  }>({ status: "idle", entries: [] });

  useEffect(() => {
    let isCurrent = true;

    void obtainLearnerSession(supabase)
      .then((session) => {
        if (isCurrent) {
          setLearnerSession(session);
          setSessionStatus("ready");
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSessionStatus("error");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [attempt, supabase]);

  useEffect(() => {
    if (activeView !== "vocabulary" || !learnerSession) {
      return;
    }

    let isCurrent = true;
    setVocabularyState({ status: "loading", entries: [] });

    void activeVocabularyRepository
      .list(learnerSession.user.id)
      .then((entries) => {
        if (isCurrent) {
          setVocabularyState({ status: "ready", entries });
        }
      })
      .catch(() => {
        if (isCurrent) {
          setVocabularyState({ status: "error", entries: [] });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeView, activeVocabularyRepository, learnerSession]);

  function retrySession() {
    setSessionStatus("loading");
    setAttempt((currentAttempt) => currentAttempt + 1);
  }

  async function submitTranslation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isTranslating) {
      return;
    }

    const session = learnerSession;
    if (!session) {
      setTranslationError("Your session is unavailable. Reload and try again.");
      return;
    }

    const validation = validateTranslationInput({
      text,
      sourceLanguage: direction.sourceLanguage,
      targetLanguage: direction.targetLanguage,
    });

    if (!validation.ok) {
      setTranslationError(validation.error.message);
      return;
    }

    setTranslationError(null);
    setSaveStatus("idle");
    setIsTranslating(true);

    try {
      const response = await translationClient.translate(
        validation.value,
        session.access_token,
      );

      setTranslation({
        ...response,
        originalText: validation.value.text,
        sourceLanguage: validation.value.sourceLanguage,
        targetLanguage: validation.value.targetLanguage,
      });

      const saveAttempt = saveAttemptRef.current + 1;
      saveAttemptRef.current = saveAttempt;
      setSaveStatus("saving");
      void activeVocabularyRepository
        .save({
          ownerId: session.user.id,
          sourceLanguage: validation.value.sourceLanguage,
          targetLanguage: validation.value.targetLanguage,
          originalText: validation.value.text,
          translatedText: response.translatedText,
        })
        .then(() => {
          if (saveAttemptRef.current === saveAttempt) {
            setSaveStatus("saved");
          }
        })
        .catch(() => {
          if (saveAttemptRef.current === saveAttempt) {
            setSaveStatus("error");
          }
        });
    } catch {
      setTranslationError("Translation is unavailable right now. Try again.");
    } finally {
      setIsTranslating(false);
    }
  }

  function updateDirection(nextDirection: typeof direction) {
    setDirection(nextDirection);
    writeLanguageDirection(directionStorage, nextDirection);
    setTranslation(null);
    setTranslationError(null);
  }

  function languageName(code: LanguageCode) {
    return code === "en" ? "English" : "Polish";
  }

  if (sessionStatus === "loading") {
    return (
      <main className="centered-state">
        <section className="state-card" aria-labelledby="loading-title">
          <p className="eyebrow">VKab</p>
          <h1 id="loading-title">Opening your workspace</h1>
          <p role="status">Preparing your private session...</p>
        </section>
      </main>
    );
  }

  if (sessionStatus === "error") {
    return (
      <main className="centered-state">
        <section
          className="state-card"
          role="alert"
          aria-labelledby="session-error-title"
        >
          <p className="eyebrow">VKab</p>
          <h1 id="session-error-title">Session unavailable</h1>
          <p>Check your connection and try again.</p>
          <button className="primary-action" type="button" onClick={retrySession}>
            Try again
          </button>
        </section>
      </main>
    );
  }

  const viewTitle = activeView === "translate" ? "Translate" : "Vocabulary";

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="wordmark">VKab</p>
        <p className="session-indicator">Private browser session</p>
      </header>
      <nav className="view-navigation" aria-label="Primary navigation">
        <button
          className="view-navigation__control"
          type="button"
          aria-current={activeView === "translate" ? "page" : undefined}
          onClick={() => setActiveView("translate")}
        >
          Translate
        </button>
        <button
          className="view-navigation__control"
          type="button"
          aria-current={activeView === "vocabulary" ? "page" : undefined}
          onClick={() => setActiveView("vocabulary")}
        >
          Vocabulary
        </button>
      </nav>
      <section className="view-panel" aria-labelledby="view-title">
        <div className="view-heading">
          <p className="eyebrow">Workspace</p>
          <h1 id="view-title">{viewTitle}</h1>
        </div>
        {activeView === "vocabulary" ? (
          <div className="vocabulary-view">
            <aside className="privacy-note" role="note">
              <strong>Private travel vocabulary</strong>
              <span>
                Clearing browser data or using another device can make this
                anonymous vocabulary inaccessible.
              </span>
            </aside>
            {vocabularyState.status === "loading" ? (
              <p role="status">Loading vocabulary...</p>
            ) : null}
            {vocabularyState.status === "error" ? (
              <p className="form-error" role="alert">
                Vocabulary is unavailable right now. Try again later.
              </p>
            ) : null}
            {vocabularyState.status === "ready" &&
            vocabularyState.entries.length > 0 ? (
              <ul className="vocabulary-list" aria-label="Saved vocabulary">
                {vocabularyState.entries.map((entry) => (
                  <li className="vocabulary-entry" key={entry.id}>
                    <p className="translation-direction">
                      {languageName(entry.sourceLanguage)} to{" "}
                      {languageName(entry.targetLanguage)}
                    </p>
                    <p>{entry.originalText}</p>
                    <strong>{entry.translatedText}</strong>
                  </li>
                ))}
              </ul>
            ) : null}
            {vocabularyState.status === "ready" &&
            vocabularyState.entries.length === 0 ? (
              <section className="empty-vocabulary">
                <h2>No saved vocabulary yet</h2>
                <p>Translate something useful and it will appear here.</p>
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => setActiveView("translate")}
                >
                  Translate a phrase
                </button>
              </section>
            ) : null}
          </div>
        ) : (
          <form className="translation-form" onSubmit={submitTranslation}>
            <div className="language-direction" aria-label="Language direction">
              <label className="language-field language-field--source">
                From
                <select
                  name="sourceLanguage"
                  value={direction.sourceLanguage}
                  onChange={(event) =>
                    updateDirection({
                      ...direction,
                      sourceLanguage: event.target.value as LanguageCode,
                    })
                  }
                >
                  <option value="en">English</option>
                  <option value="pl">Polish</option>
                </select>
              </label>
              <button
                className="swap-action"
                type="button"
                onClick={() =>
                  updateDirection({
                    sourceLanguage: direction.targetLanguage,
                    targetLanguage: direction.sourceLanguage,
                  })
                }
              >
                Swap languages
              </button>
              <label className="language-field language-field--target">
                To
                <select
                  name="targetLanguage"
                  value={direction.targetLanguage}
                  onChange={(event) =>
                    updateDirection({
                      ...direction,
                      targetLanguage: event.target.value as LanguageCode,
                    })
                  }
                >
                  <option value="en">English</option>
                  <option value="pl">Polish</option>
                </select>
              </label>
            </div>
            <div className="translation-input">
              <label htmlFor="translation-text">Word or phrase</label>
              <textarea
                aria-describedby="phrase-guidance"
                id="translation-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={3}
              />
              <span id="phrase-guidance" className="field-guidance">
                300 characters max
              </span>
            </div>
            <button
              className="primary-action"
              type="submit"
              disabled={isTranslating}
            >
              {isTranslating ? "Translating..." : "Translate phrase"}
            </button>
            {isTranslating ? <p role="status">Translating...</p> : null}
            {translationError ? (
              <p className="form-error" role="alert">
                {translationError}
              </p>
            ) : null}
            {translation ? (
              <section
                className="translation-result"
                aria-label="Translation result"
                aria-live="polite"
              >
                <p className="translation-direction">
                  {languageName(translation.sourceLanguage)} to{" "}
                  {languageName(translation.targetLanguage)}
                </p>
                <p>{translation.originalText}</p>
                <strong>{translation.translatedText}</strong>
                {saveStatus === "saving" ? (
                  <p role="status">Saving to vocabulary...</p>
                ) : null}
                {saveStatus === "saved" ? (
                  <p role="status">Saved to vocabulary</p>
                ) : null}
                {saveStatus === "error" ? (
                  <p className="form-error" role="alert">
                    Translation shown, but vocabulary could not be saved.
                  </p>
                ) : null}
              </section>
            ) : null}
          </form>
        )}
      </section>
    </main>
  );
}
