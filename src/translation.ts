export const supportedLanguages = {
  en: "English",
  pl: "Polish",
} as const;

export type LanguageCode = keyof typeof supportedLanguages;

export interface TranslationInput {
  text: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
}

export interface PublicError {
  code: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; value: TranslationInput }
  | { ok: false; error: PublicError };

export function validateTranslationInput(input: {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}): ValidationResult {
  const text = input.text.trim();

  if (!text) {
    return {
      ok: false,
      error: {
        code: "EMPTY_TEXT",
        message: "Enter a word or phrase to translate.",
      },
    };
  }

  if (Array.from(text).length > 300) {
    return {
      ok: false,
      error: {
        code: "TEXT_TOO_LONG",
        message: "Keep the phrase to 300 characters or fewer.",
      },
    };
  }

  if (
    !(input.sourceLanguage in supportedLanguages) ||
    !(input.targetLanguage in supportedLanguages)
  ) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_LANGUAGE",
        message: "Choose a supported language.",
      },
    };
  }

  if (input.sourceLanguage === input.targetLanguage) {
    return {
      ok: false,
      error: {
        code: "SAME_LANGUAGE",
        message: "Choose two different languages.",
      },
    };
  }

  return {
    ok: true,
    value: {
      text,
      sourceLanguage: input.sourceLanguage as LanguageCode,
      targetLanguage: input.targetLanguage as LanguageCode,
    },
  };
}
