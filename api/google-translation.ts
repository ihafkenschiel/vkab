import type { TranslationInput } from "../src/translation";

type FetchProvider = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function createGoogleTranslationGateway(
  apiKey: string,
  fetchProvider: FetchProvider = fetch,
) {
  return async function translate(input: TranslationInput): Promise<string> {
    const endpoint = new URL(
      "https://translation.googleapis.com/language/translate/v2",
    );
    endpoint.searchParams.set("key", apiKey);

    const response = await fetchProvider(endpoint.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: input.text,
        source: input.sourceLanguage,
        target: input.targetLanguage,
        format: "text",
      }),
    });

    if (!response.ok) {
      throw new Error("Translation provider rejected the request.");
    }

    const body = (await response.json()) as {
      data?: { translations?: Array<{ translatedText?: unknown }> };
    };
    const translatedText = body.data?.translations?.[0]?.translatedText;

    if (typeof translatedText !== "string" || !translatedText) {
      throw new Error("Translation provider returned an invalid response.");
    }

    return translatedText;
  };
}
