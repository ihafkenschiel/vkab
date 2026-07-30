import type { TranslationInput } from "./translation";

export type TranslationRequest = TranslationInput;

export interface TranslationResponse {
  translatedText: string;
}

export interface TranslationClient {
  translate(
    request: TranslationRequest,
    accessToken: string,
  ): Promise<TranslationResponse>;
}

type FetchBrowser = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function createBrowserTranslationClient(
  fetchBrowser: FetchBrowser = fetch,
): TranslationClient {
  return {
    async translate(request, accessToken) {
      const response = await fetchBrowser("/api/translate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

      if (!response.ok) {
        throw new Error("Translation is unavailable right now. Try again.");
      }

      const body = (await response.json()) as Record<string, unknown>;

      if (typeof body.translatedText !== "string" || !body.translatedText) {
        throw new Error("Translation is unavailable right now. Try again.");
      }

      return { translatedText: body.translatedText };
    },
  };
}

export const browserTranslationClient = createBrowserTranslationClient();
