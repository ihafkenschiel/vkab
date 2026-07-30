import { describe, expect, it, vi } from "vitest";

import { createTranslateHandler } from "./translate";

describe("POST /api/translate", () => {
  it("authenticates the learner and translates a valid phrase", async () => {
    const authenticate = vi.fn().mockResolvedValue(true);
    const translate = vi.fn().mockResolvedValue("Dzień dobry");
    const handle = createTranslateHandler({ authenticate, translate });
    const request = new Request("https://example.test/api/translate", {
      method: "POST",
      headers: {
        Authorization: "Bearer learner-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "  Good morning  ",
        sourceLanguage: "en",
        targetLanguage: "pl",
      }),
    });

    const response = await handle(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      translatedText: "Dzień dobry",
    });
    expect(authenticate).toHaveBeenCalledWith("learner-token");
    expect(translate).toHaveBeenCalledWith({
      text: "Good morning",
      sourceLanguage: "en",
      targetLanguage: "pl",
    });
  });

  it("rejects a request without a bearer token before translation", async () => {
    const authenticate = vi.fn();
    const translate = vi.fn();
    const handle = createTranslateHandler({ authenticate, translate });
    const request = new Request("https://example.test/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Good morning",
        sourceLanguage: "en",
        targetLanguage: "pl",
      }),
    });

    const response = await handle(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "UNAUTHORIZED",
      message: "Your session is not valid.",
    });
    expect(authenticate).not.toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
  });

  it("rejects raw tokens and other authorization schemes before authentication", async () => {
    const authenticate = vi.fn().mockResolvedValue(true);
    const translate = vi.fn().mockResolvedValue("Dzień dobry");
    const handle = createTranslateHandler({ authenticate, translate });

    for (const authorization of [
      "learner-token",
      "Basic learner-token",
      "Bearer    ",
    ]) {
      const request = new Request("https://example.test/api/translate", {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: "Good morning",
          sourceLanguage: "en",
          targetLanguage: "pl",
        }),
      });

      const response = await handle(request);

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        code: "UNAUTHORIZED",
        message: "Your session is not valid.",
      });
    }

    expect(authenticate).not.toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
  });

  it("distinguishes authentication infrastructure failure from an invalid token", async () => {
    const authenticate = vi
      .fn()
      .mockRejectedValue(new Error("private-auth-detail"));
    const translate = vi.fn();
    const handle = createTranslateHandler({ authenticate, translate });
    const request = new Request("https://example.test/api/translate", {
      method: "POST",
      headers: {
        Authorization: "Bearer learner-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "Good morning",
        sourceLanguage: "en",
        targetLanguage: "pl",
      }),
    });

    const response = await handle(request);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      code: "AUTH_UNAVAILABLE",
      message: "Your session could not be verified. Try again.",
    });
    expect(JSON.stringify(body)).not.toContain("private-auth-detail");
    expect(translate).not.toHaveBeenCalled();
  });

  it("returns a safe error for malformed JSON", async () => {
    const authenticate = vi.fn().mockResolvedValue(true);
    const translate = vi.fn();
    const handle = createTranslateHandler({ authenticate, translate });
    const request = new Request("https://example.test/api/translate", {
      method: "POST",
      headers: {
        Authorization: "Bearer learner-token",
        "Content-Type": "application/json",
      },
      body: "not-json",
    });

    const response = await handle(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_REQUEST",
      message: "Send a valid translation request.",
    });
    expect(translate).not.toHaveBeenCalled();
  });

  it("hides provider failure details behind a stable public error", async () => {
    const authenticate = vi.fn().mockResolvedValue(true);
    const translate = vi
      .fn()
      .mockRejectedValue(new Error("key=secret-provider-detail"));
    const handle = createTranslateHandler({ authenticate, translate });
    const request = new Request("https://example.test/api/translate", {
      method: "POST",
      headers: {
        Authorization: "Bearer learner-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "Good morning",
        sourceLanguage: "en",
        targetLanguage: "pl",
      }),
    });

    const response = await handle(request);

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({
      code: "TRANSLATION_UNAVAILABLE",
      message: "Translation is unavailable right now. Try again.",
    });
    expect(JSON.stringify(body)).not.toContain("secret-provider-detail");
  });

  it("revalidates language direction before calling the provider", async () => {
    const authenticate = vi.fn().mockResolvedValue(true);
    const translate = vi.fn();
    const handle = createTranslateHandler({ authenticate, translate });
    const request = new Request("https://example.test/api/translate", {
      method: "POST",
      headers: {
        Authorization: "Bearer learner-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "Good morning",
        sourceLanguage: "en",
        targetLanguage: "en",
      }),
    });

    const response = await handle(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "SAME_LANGUAGE",
      message: "Choose two different languages.",
    });
    expect(translate).not.toHaveBeenCalled();
  });

  it("rejects language names inherited from the catalog prototype", async () => {
    const authenticate = vi.fn().mockResolvedValue(true);
    const translate = vi.fn();
    const handle = createTranslateHandler({ authenticate, translate });
    const request = new Request("https://example.test/api/translate", {
      method: "POST",
      headers: {
        Authorization: "Bearer learner-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "Good morning",
        sourceLanguage: "toString",
        targetLanguage: "pl",
      }),
    });

    const response = await handle(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "UNSUPPORTED_LANGUAGE",
      message: "Choose a supported language.",
    });
    expect(translate).not.toHaveBeenCalled();
  });
});
