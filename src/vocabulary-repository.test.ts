import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { createSupabaseVocabularyRepository } from "./vocabulary-repository";

describe("Supabase vocabulary repository", () => {
  it("saves through the authenticated atomic boundary without accepting an owner", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "entry-1",
        owner_id: "learner-1",
        source_language: "en",
        target_language: "pl",
        original_text: "  Good   Morning  ",
        normalized_original_text: "good morning",
        translated_text: "Dzień dobry",
        lookup_count: 1,
        created_at: "2026-07-29T12:00:00.000Z",
        last_looked_up_at: "2026-07-29T12:00:00.000Z",
      },
      error: null,
    });
    const repository = createSupabaseVocabularyRepository({
      rpc,
    } as unknown as SupabaseClient);

    const saved = await repository.save({
      sourceLanguage: "en",
      targetLanguage: "pl",
      originalText: "  Good   Morning  ",
      translatedText: "Dzień dobry",
    });

    expect(rpc).toHaveBeenCalledWith("save_vocabulary_entry", {
      p_source_language: "en",
      p_target_language: "pl",
      p_original_text: "  Good   Morning  ",
      p_translated_text: "Dzień dobry",
    });
    expect(saved).toEqual({
      id: "entry-1",
      ownerId: "learner-1",
      sourceLanguage: "en",
      targetLanguage: "pl",
      originalText: "  Good   Morning  ",
      translatedText: "Dzień dobry",
      lookupCount: 1,
      createdAt: "2026-07-29T12:00:00.000Z",
      lastLookedUpAt: "2026-07-29T12:00:00.000Z",
    });
  });

  it("rejects a malformed save response with a safe message", async () => {
    const repository = createSupabaseVocabularyRepository({
      rpc: vi.fn().mockResolvedValue({
        data: { id: "entry-1", private_detail: "should not escape" },
        error: null,
      }),
    } as unknown as SupabaseClient);

    await expect(
      repository.save({
        sourceLanguage: "en",
        targetLanguage: "pl",
        originalText: "Hello",
        translatedText: "Cześć",
      }),
    ).rejects.toThrow("Vocabulary could not be saved.");
  });

  it("lists only the learner's entries from newest lookup to oldest", async () => {
    const rows = [
      {
        id: "entry-new",
        owner_id: "learner-1",
        source_language: "pl",
        target_language: "en",
        original_text: "Poproszę rachunek",
        translated_text: "The check, please",
        lookup_count: 1,
        created_at: "2026-07-29T13:00:00.000Z",
        last_looked_up_at: "2026-07-29T13:00:00.000Z",
      },
      {
        id: "entry-old",
        owner_id: "learner-1",
        source_language: "en",
        target_language: "pl",
        original_text: "Good morning",
        translated_text: "Dzień dobry",
        lookup_count: 1,
        created_at: "2026-07-29T12:00:00.000Z",
        last_looked_up_at: "2026-07-29T12:00:00.000Z",
      },
    ];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const repository = createSupabaseVocabularyRepository({
      from,
    } as unknown as SupabaseClient);

    const entries = await repository.list("learner-1");

    expect(eq).toHaveBeenCalledWith("owner_id", "learner-1");
    expect(order).toHaveBeenCalledWith("last_looked_up_at", {
      ascending: false,
    });
    expect(entries.map((entry) => entry.id)).toEqual([
      "entry-new",
      "entry-old",
    ]);
  });

  it("keeps two learners isolated through the repository's owner-scoped list contract", async () => {
    const rows = [
      {
        id: "learner-one-entry",
        owner_id: "learner-1",
        source_language: "en",
        target_language: "pl",
        original_text: "Hello",
        translated_text: "Cześć",
        lookup_count: 1,
        created_at: "2026-07-29T12:00:00.000Z",
        last_looked_up_at: "2026-07-29T12:00:00.000Z",
      },
      {
        id: "learner-two-entry",
        owner_id: "learner-2",
        source_language: "pl",
        target_language: "en",
        original_text: "Dziękuję",
        translated_text: "Thank you",
        lookup_count: 1,
        created_at: "2026-07-29T13:00:00.000Z",
        last_looked_up_at: "2026-07-29T13:00:00.000Z",
      },
    ];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: (_column: string, ownerId: string) => ({
            order: async () => ({
              data: rows.filter((row) => row.owner_id === ownerId),
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    const repository = createSupabaseVocabularyRepository(supabase);

    const learnerOneEntries = await repository.list("learner-1");
    const learnerTwoEntries = await repository.list("learner-2");

    expect(learnerOneEntries.map((entry) => entry.id)).toEqual([
      "learner-one-entry",
    ]);
    expect(learnerTwoEntries.map((entry) => entry.id)).toEqual([
      "learner-two-entry",
    ]);
  });
});
