import { describe, expect, it } from "vitest";

import { readPublicEnvironment } from "./environment";

describe("public browser configuration", () => {
  it("reports every missing setting with safe setup guidance", () => {
    expect(() => readPublicEnvironment({})).toThrowError(
      "Missing required public configuration: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY. Add them to .env.local and restart VKab.",
    );
  });

  it("rejects an invalid Supabase URL without echoing its value", () => {
    expect(() =>
      readPublicEnvironment({
        VITE_SUPABASE_URL: "not a project URL",
        VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
      }),
    ).toThrowError(
      "VITE_SUPABASE_URL must be a valid URL. Update .env.local and restart VKab.",
    );
  });
});
