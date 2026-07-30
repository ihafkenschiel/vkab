import type { LanguageCode } from "./translation";

export interface LanguageDirection {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
}

export interface DirectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const storageKey = "vkab.language-direction";
const defaultDirection: LanguageDirection = {
  sourceLanguage: "en",
  targetLanguage: "pl",
};

export function readLanguageDirection(
  storage: DirectionStorage,
): LanguageDirection {
  try {
    const storedValue = storage.getItem(storageKey);

    if (!storedValue) {
      return defaultDirection;
    }

    const candidate = JSON.parse(storedValue) as Record<string, unknown>;

    if (
      candidate.version === 1 &&
      (candidate.sourceLanguage === "en" ||
        candidate.sourceLanguage === "pl") &&
      (candidate.targetLanguage === "en" ||
        candidate.targetLanguage === "pl") &&
      candidate.sourceLanguage !== candidate.targetLanguage
    ) {
      return {
        sourceLanguage: candidate.sourceLanguage,
        targetLanguage: candidate.targetLanguage,
      };
    }
  } catch {
    return defaultDirection;
  }

  return defaultDirection;
}

export function writeLanguageDirection(
  storage: DirectionStorage,
  direction: LanguageDirection,
) {
  try {
    storage.setItem(
      storageKey,
      JSON.stringify({ version: 1, ...direction }),
    );
  } catch {
    // The current direction remains usable when browser storage is unavailable.
  }
}
