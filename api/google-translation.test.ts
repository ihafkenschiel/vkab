import { describe, expect, it, vi } from "vitest";

import { createGoogleTranslationGateway } from "./google-translation";

describe("Google translation gateway", () => {
  it("sends the documented Basic v2 request and returns translated text", async () => {
    const fetchProvider = vi.fn().mockResolvedValue(
      Response.json({
        data: { translations: [{ translatedText: "Dzień dobry" }] },
      }),
    );
    const translate = createGoogleTranslationGateway(
      "server-api-key",
      fetchProvider,
    );

    await expect(
      translate({
        text: "Good morning",
        sourceLanguage: "en",
        targetLanguage: "pl",
      }),
    ).resolves.toBe("Dzień dobry");

    expect(fetchProvider).toHaveBeenCalledOnce();
    const [url, init] = fetchProvider.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://translation.googleapis.com/language/translate/v2?key=server-api-key",
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: "Good morning",
        source: "en",
        target: "pl",
        format: "text",
      }),
    });
  });

  it("rejects a malformed provider response", async () => {
    const fetchProvider = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { translations: [] } }));
    const translate = createGoogleTranslationGateway(
      "server-api-key",
      fetchProvider,
    );

    await expect(
      translate({
        text: "Good morning",
        sourceLanguage: "en",
        targetLanguage: "pl",
      }),
    ).rejects.toThrow("invalid response");
  });

  it("rejects a whitespace-only provider translation", async () => {
    const fetchProvider = vi.fn().mockResolvedValue(
      Response.json({
        data: { translations: [{ translatedText: "   " }] },
      }),
    );
    const translate = createGoogleTranslationGateway(
      "server-api-key",
      fetchProvider,
    );

    await expect(
      translate({
        text: "Good morning",
        sourceLanguage: "en",
        targetLanguage: "pl",
      }),
    ).rejects.toThrow("invalid response");
  });
});
