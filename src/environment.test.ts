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

  it("rejects unsupported URL schemes with safe setup guidance", () => {
    expect(() =>
      readPublicEnvironment({
        VITE_SUPABASE_URL: "ftp://project.supabase.co/private-value",
        VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
      }),
    ).toThrowError(
      "VITE_SUPABASE_URL must use HTTP or HTTPS. Update .env.local and restart VKab.",
    );
  });

  it("normalizes the validated Supabase URL", () => {
    expect(
      readPublicEnvironment({
        VITE_SUPABASE_URL: "HTTPS://PROJECT.SUPABASE.CO:443/",
        VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
      }).supabaseUrl,
    ).toBe("https://project.supabase.co");
  });
});
