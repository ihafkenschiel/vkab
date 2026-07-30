import { describe, expect, it } from "vitest";

import { validateTranslationInput } from "./translation";

describe("translation input", () => {
  it("rejects an identical source and target language", () => {
    expect(
      validateTranslationInput({
        text: "Good morning",
        sourceLanguage: "en",
        targetLanguage: "en",
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "SAME_LANGUAGE",
        message: "Choose two different languages.",
      },
    });
  });

  it("rejects a language outside the supported catalog", () => {
    expect(
      validateTranslationInput({
        text: "Good morning",
        sourceLanguage: "de",
        targetLanguage: "pl",
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "UNSUPPORTED_LANGUAGE",
        message: "Choose a supported language.",
      },
    });
  });

  it("counts Unicode characters when enforcing the phrase limit", () => {
    expect(
      validateTranslationInput({
        text: "😊".repeat(301),
        sourceLanguage: "en",
        targetLanguage: "pl",
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "TEXT_TOO_LONG",
        message: "Keep the phrase to 300 characters or fewer.",
      },
    });
  });
});
