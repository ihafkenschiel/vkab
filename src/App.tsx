import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { obtainLearnerSession } from "./session";

interface AppProps {
  supabase: SupabaseClient;
}

export function App({ supabase }: AppProps) {
  const [sessionStatus, setSessionStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [attempt, setAttempt] = useState(0);
  const [activeView, setActiveView] = useState<"translate" | "vocabulary">(
    "translate",
  );

  useEffect(() => {
    let isCurrent = true;

    void obtainLearnerSession(supabase)
      .then(() => {
        if (isCurrent) {
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
        ) : null}
      </section>
    </main>
  );
}
