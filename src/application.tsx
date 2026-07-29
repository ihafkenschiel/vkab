import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { App } from "./App";
import { readPublicEnvironment } from "./environment";

type BrowserClientFactory = (
  supabaseUrl: string,
  supabasePublishableKey: string,
) => SupabaseClient;

function ConfigurationError({ guidance }: { guidance: string }) {
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

export function configureApplication(
  environment: Record<string, unknown>,
  createBrowserClient: BrowserClientFactory = createClient,
) {
  let publicEnvironment;

  try {
    publicEnvironment = readPublicEnvironment(environment);
  } catch (error) {
    const guidance =
      error instanceof Error
        ? error.message
        : "Check .env.local and restart VKab.";

    return function ApplicationConfigurationError() {
      return <ConfigurationError guidance={guidance} />;
    };
  }

  let supabase;

  try {
    supabase = createBrowserClient(
      publicEnvironment.supabaseUrl,
      publicEnvironment.supabasePublishableKey,
    );
  } catch {
    return function BrowserClientConfigurationError() {
      return (
        <ConfigurationError guidance="Supabase browser configuration could not be initialized. Check .env.local and restart VKab." />
      );
    };
  }

  return function Application() {
    return <App supabase={supabase} />;
  };
}
