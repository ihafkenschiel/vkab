import { useEffect, useState } from "react";
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

interface AppProps {
  supabase: SupabaseClient;
  translationClient?: TranslationClient;
  directionStorage?: DirectionStorage;
}

export function App({
  supabase,
  translationClient = browserTranslationClient,
  directionStorage = window.localStorage,
}: AppProps) {
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
  const [direction, setDirection] = useState(() =>
    readLanguageDirection(directionStorage),
  );

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

  function retrySession() {
    setSessionStatus("loading");
    setAttempt((currentAttempt) => currentAttempt + 1);
  }

  async function submitTranslation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isTranslating) {
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
    setIsTranslating(true);

    try {
      const response = await translationClient.translate(
        validation.value,
        learnerSession?.access_token ?? "",
      );

      setTranslation({
        ...response,
        originalText: validation.value.text,
        sourceLanguage: validation.value.sourceLanguage,
        targetLanguage: validation.value.targetLanguage,
      });
      setText(validation.value.text);
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
          <aside className="privacy-note" role="note">
            <strong>Browser-only vocabulary</strong>
            <span>
              Clearing browser data or using another device can make this
              vocabulary inaccessible.
            </span>
          </aside>
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
                maxLength={300}
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
              </section>
            ) : null}
          </form>
        )}
      </section>
    </main>
  );
}
