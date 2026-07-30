import { describe, expect, it, vi } from "vitest";

import { createBrowserTranslationClient } from "./translation-client";

describe("browser translation client", () => {
  it("uses the same-origin endpoint without exposing provider credentials", async () => {
    const fetchBrowser = vi.fn().mockResolvedValue(
      Response.json({ translatedText: "Dzień dobry" }, { status: 200 }),
    );
    const client = createBrowserTranslationClient(fetchBrowser);

    await expect(
      client.translate(
        {
          text: "Good morning",
          sourceLanguage: "en",
          targetLanguage: "pl",
        },
        "learner-token",
      ),
    ).resolves.toEqual({ translatedText: "Dzień dobry" });

    const [url, init] = fetchBrowser.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/translate");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer learner-token",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.stringify([url, init])).not.toContain("server-api-key");
  });

  it("rejects a malformed endpoint response without exposing its contents", async () => {
    const fetchBrowser = vi.fn().mockResolvedValue(
      Response.json(
        { unexpected: "private-server-detail" },
        { status: 200 },
      ),
    );
    const client = createBrowserTranslationClient(fetchBrowser);

    await expect(
      client.translate(
        {
          text: "Good morning",
          sourceLanguage: "en",
          targetLanguage: "pl",
        },
        "learner-token",
      ),
    ).rejects.toThrow("Translation is unavailable right now. Try again.");
  });
});
