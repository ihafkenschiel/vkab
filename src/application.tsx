import { createClient } from "@supabase/supabase-js";

import { App } from "./App";
import { readPublicEnvironment } from "./environment";

interface ConfiguredApplicationProps {
  environment: Record<string, unknown>;
}

export function ConfiguredApplication({
  environment,
}: ConfiguredApplicationProps) {
  let publicEnvironment;

  try {
    publicEnvironment = readPublicEnvironment(environment);
  } catch (error) {
    const guidance =
      error instanceof Error
        ? error.message
        : "Check .env.local and restart VKab.";

    return (
      <main className="centered-state">
        <section
          className="state-card"
          role="alert"
          aria-labelledby="configuration-error-title"
        >
          <p className="eyebrow">VKab</p>
          <h1 id="configuration-error-title">Configuration needed</h1>
          <p>{guidance}</p>
        </section>
      </main>
    );
  }

  const supabase = createClient(
    publicEnvironment.supabaseUrl,
    publicEnvironment.supabasePublishableKey,
  );

  return <App supabase={supabase} />;
}
