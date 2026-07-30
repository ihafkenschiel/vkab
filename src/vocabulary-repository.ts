import type { SupabaseClient } from "@supabase/supabase-js";

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
  ownerId: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  originalText: string;
  translatedText: string;
}

export interface VocabularyRepository {
  save(entry: SaveVocabularyEntry): Promise<VocabularyEntry>;
  list(ownerId: string): Promise<VocabularyEntry[]>;
}

interface VocabularyRow {
  id: string;
  owner_id: string;
  source_language: LanguageCode;
  target_language: LanguageCode;
  original_text: string;
  translated_text: string;
  lookup_count: number;
  created_at: string;
  last_looked_up_at: string;
}

function normalizeOriginalText(text: string) {
  return text.trim().replace(/\s+/gu, " ").normalize("NFC").toLowerCase();
}

function toVocabularyEntry(row: VocabularyRow): VocabularyEntry {
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
      const { data, error } = await supabase
        .from("vocabulary_entries")
        .insert({
          owner_id: entry.ownerId,
          source_language: entry.sourceLanguage,
          target_language: entry.targetLanguage,
          original_text: entry.originalText,
          normalized_original_text: normalizeOriginalText(entry.originalText),
          translated_text: entry.translatedText,
          lookup_count: 1,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error("Vocabulary could not be saved.");
      }

      return toVocabularyEntry(data as VocabularyRow);
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

      return (data as VocabularyRow[]).map(toVocabularyEntry);
    },
  };
}
