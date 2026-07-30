import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { LanguageCode } from "./translation";

export interface VocabularyEntry {
  id: string;
  ownerId: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  originalText: string;
  translatedText: string;
  lookupCount: number;
  createdAt: string;
  lastLookedUpAt: string;
}

export interface SaveVocabularyEntry {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  originalText: string;
  translatedText: string;
}

export interface VocabularyRepository {
  save(entry: SaveVocabularyEntry): Promise<VocabularyEntry>;
  list(ownerId: string): Promise<VocabularyEntry[]>;
}

const VocabularyRowSchema = z.object({
  id: z.string().min(1),
  owner_id: z.string().min(1),
  source_language: z.enum(["en", "pl"]),
  target_language: z.enum(["en", "pl"]),
  original_text: z.string().min(1),
  translated_text: z.string().min(1),
  lookup_count: z.number().int().min(1),
  created_at: z.string().min(1),
  last_looked_up_at: z.string().min(1),
});

function toVocabularyEntry(value: unknown): VocabularyEntry {
  const parsed = VocabularyRowSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error("Vocabulary could not be loaded.");
  }

  const row = parsed.data;

  return {
    id: row.id,
    ownerId: row.owner_id,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    originalText: row.original_text,
    translatedText: row.translated_text,
    lookupCount: row.lookup_count,
    createdAt: row.created_at,
    lastLookedUpAt: row.last_looked_up_at,
  };
}

export function createSupabaseVocabularyRepository(
  supabase: SupabaseClient,
): VocabularyRepository {
  return {
    async save(entry) {
      const { data, error } = await supabase.rpc("save_vocabulary_entry", {
        p_source_language: entry.sourceLanguage,
        p_target_language: entry.targetLanguage,
        p_original_text: entry.originalText,
        p_translated_text: entry.translatedText,
      });

      if (error || !data) {
        throw new Error("Vocabulary could not be saved.");
      }

      const row = Array.isArray(data) ? data[0] : data;

      if (!row) {
        throw new Error("Vocabulary could not be saved.");
      }

      try {
        return toVocabularyEntry(row);
      } catch {
        throw new Error("Vocabulary could not be saved.");
      }
    },

    async list(ownerId) {
      const { data, error } = await supabase
        .from("vocabulary_entries")
        .select()
        .eq("owner_id", ownerId)
        .order("last_looked_up_at", { ascending: false });

      if (error || !data) {
        throw new Error("Vocabulary could not be loaded.");
      }

      try {
        return (data as unknown[]).map(toVocabularyEntry);
      } catch {
        throw new Error("Vocabulary could not be loaded.");
      }
    },
  };
}
