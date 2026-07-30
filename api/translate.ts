import { createClient } from "@supabase/supabase-js";

import { validateTranslationInput } from "../src/translation";
import type { TranslationInput } from "../src/translation";
import { createGoogleTranslationGateway } from "./google-translation";
import { createSupabaseAuthGateway } from "./supabase-auth";

export interface TranslateDependencies {
  authenticate(accessToken: string): Promise<boolean>;
  translate(input: TranslationInput): Promise<string>;
}

function jsonResponse(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function createTranslateHandler(dependencies: TranslateDependencies) {
  return async function handleTranslate(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return jsonResponse(
        { code: "METHOD_NOT_ALLOWED", message: "Use POST for translation." },
        405,
      );
    }

    const accessToken = request.headers
      .get("Authorization")
      ?.replace(/^Bearer\s+/i, "");

    let authenticated = false;

    try {
      authenticated = Boolean(
        accessToken && (await dependencies.authenticate(accessToken)),
      );
    } catch {
      authenticated = false;
    }

    if (!authenticated) {
      return jsonResponse(
        { code: "UNAUTHORIZED", message: "Your session is not valid." },
        401,
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        {
          code: "INVALID_REQUEST",
          message: "Send a valid translation request.",
        },
        400,
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse(
        {
          code: "INVALID_REQUEST",
          message: "Send a valid translation request.",
        },
        400,
      );
    }

    const candidate = body as Record<string, unknown>;

    if (
      typeof candidate.text !== "string" ||
      typeof candidate.sourceLanguage !== "string" ||
      typeof candidate.targetLanguage !== "string"
    ) {
      return jsonResponse(
        {
          code: "INVALID_REQUEST",
          message: "Send a valid translation request.",
        },
        400,
      );
    }
    const validation = validateTranslationInput({
      text: candidate.text,
      sourceLanguage: candidate.sourceLanguage,
      targetLanguage: candidate.targetLanguage,
    });

    if (!validation.ok) {
      return jsonResponse(validation.error, 400);
    }

    let translatedText: string;

    try {
      translatedText = await dependencies.translate(validation.value);
    } catch {
      return jsonResponse(
        {
          code: "TRANSLATION_UNAVAILABLE",
          message: "Translation is unavailable right now. Try again.",
        },
        502,
      );
    }

    return jsonResponse({ translatedText }, 200);
  };
}

let productionHandler: ReturnType<typeof createTranslateHandler> | undefined;

function configureProductionHandler() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const googleApiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

  if (!supabaseUrl || !supabasePublishableKey || !googleApiKey) {
    throw new Error("Server configuration is incomplete.");
  }

  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return createTranslateHandler({
    authenticate: createSupabaseAuthGateway(supabase),
    translate: createGoogleTranslationGateway(googleApiKey),
  });
}

export default async function translateEndpoint(
  request: Request,
): Promise<Response> {
  try {
    productionHandler ??= configureProductionHandler();
    return await productionHandler(request);
  } catch {
    return jsonResponse(
      {
        code: "SERVER_UNAVAILABLE",
        message: "Translation is unavailable right now. Try again.",
      },
      503,
    );
  }
}
