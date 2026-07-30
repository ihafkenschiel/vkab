import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const learnerOneId = "11111111-1111-4111-8111-111111111111";
const learnerTwoId = "22222222-2222-4222-8222-222222222222";

async function createVocabularyDatabase() {
  const database = await PGlite.create();
  const migrationDirectory = resolve(process.cwd(), "supabase/migrations");

  await database.exec(`
    create schema auth;
    create role authenticated nologin;
    create table auth.users (id uuid primary key);
    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    insert into auth.users (id) values
      ('${learnerOneId}'),
      ('${learnerTwoId}');
  `);
  for (const filename of readdirSync(migrationDirectory).sort()) {
    await database.exec(
      readFileSync(resolve(migrationDirectory, filename), "utf8"),
    );
  }
  await database.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete
      on table public.vocabulary_entries
      to authenticated;
  `);

  return database;
}

async function queryAsUser<T extends Record<string, unknown>>(
  database: PGlite,
  userId: string,
  sql: string,
  params: unknown[] = [],
) {
  await database.exec("begin");

  try {
    await database.exec("set local role authenticated");
    await database.query(
      "select set_config('request.jwt.claim.sub', $1, true)",
      [userId],
    );
    const result = await database.query<T>(sql, params);
    await database.exec("commit");
    return result;
  } catch (error) {
    await database.exec("rollback");
    throw error;
  }
}

describe("vocabulary row-level security", () => {
  it("allows an authenticated learner to create, read, update, and delete their own row", async () => {
    const database = await createVocabularyDatabase();

    try {
      await queryAsUser(
        database,
        learnerOneId,
        `insert into public.vocabulary_entries (
          owner_id,
          source_language,
          target_language,
          original_text,
          normalized_original_text,
          translated_text
        ) values ($1, 'en', 'pl', 'Good morning', 'good morning', 'Dzień dobry')`,
        [learnerOneId],
      );

      const selected = await queryAsUser<{ translated_text: string }>(
        database,
        learnerOneId,
        "select translated_text from public.vocabulary_entries",
      );
      expect(selected.rows).toEqual([{ translated_text: "Dzień dobry" }]);

      const updated = await queryAsUser<{ translated_text: string }>(
        database,
        learnerOneId,
        `update public.vocabulary_entries
         set translated_text = 'Dzień dobry!'
         returning translated_text`,
      );
      expect(updated.rows).toEqual([{ translated_text: "Dzień dobry!" }]);

      const deleted = await queryAsUser<{ id: string }>(
        database,
        learnerOneId,
        "delete from public.vocabulary_entries returning id",
      );
      expect(deleted.rows).toHaveLength(1);
    } finally {
      await database.close();
    }
  });

  it("prevents one learner from reading, changing, deleting, or creating rows owned by another", async () => {
    const database = await createVocabularyDatabase();

    try {
      await queryAsUser(
        database,
        learnerOneId,
        `insert into public.vocabulary_entries (
          owner_id,
          source_language,
          target_language,
          original_text,
          normalized_original_text,
          translated_text
        ) values ($1, 'en', 'pl', 'Good morning', 'good morning', 'Dzień dobry')`,
        [learnerOneId],
      );

      const hidden = await queryAsUser<{ id: string }>(
        database,
        learnerTwoId,
        "select id from public.vocabulary_entries",
      );
      expect(hidden.rows).toEqual([]);

      const unchanged = await queryAsUser<{ id: string }>(
        database,
        learnerTwoId,
        `update public.vocabulary_entries
         set translated_text = 'tampered'
         returning id`,
      );
      expect(unchanged.rows).toEqual([]);

      const notDeleted = await queryAsUser<{ id: string }>(
        database,
        learnerTwoId,
        "delete from public.vocabulary_entries returning id",
      );
      expect(notDeleted.rows).toEqual([]);

      await expect(
        queryAsUser(
          database,
          learnerTwoId,
          `insert into public.vocabulary_entries (
            owner_id,
            source_language,
            target_language,
            original_text,
            normalized_original_text,
            translated_text
          ) values ($1, 'en', 'pl', 'Hello', 'hello', 'Cześć')`,
          [learnerOneId],
        ),
      ).rejects.toThrow(/row-level security policy/i);

      const ownerView = await queryAsUser<{ translated_text: string }>(
        database,
        learnerOneId,
        "select translated_text from public.vocabulary_entries",
      );
      expect(ownerView.rows).toEqual([{ translated_text: "Dzień dobry" }]);
    } finally {
      await database.close();
    }
  });

  it("rejects whitespace-only vocabulary fields while accepting legitimate Unicode text", async () => {
    const database = await createVocabularyDatabase();
    const whitespaceValues = ["   ", "\t\t", "\n\n"];
    const fields = [
      "original_text",
      "normalized_original_text",
      "translated_text",
    ] as const;

    try {
      for (const field of fields) {
        for (const whitespace of whitespaceValues) {
          const values = {
            original_text: "Where is the cafe?",
            normalized_original_text: "where is the cafe?",
            translated_text: "Gdzie jest kawiarnia?",
          };
          values[field] = whitespace;

          await expect(
            queryAsUser(
              database,
              learnerOneId,
              `insert into public.vocabulary_entries (
                owner_id,
                source_language,
                target_language,
                original_text,
                normalized_original_text,
                translated_text
              ) values ($1, 'en', 'pl', $2, $3, $4)`,
              [
                learnerOneId,
                values.original_text,
                values.normalized_original_text,
                values.translated_text,
              ],
            ),
          ).rejects.toThrow(/check constraint/i);
        }
      }

      const accepted = await queryAsUser<{ original_text: string }>(
        database,
        learnerOneId,
        `insert into public.vocabulary_entries (
          owner_id,
          source_language,
          target_language,
          original_text,
          normalized_original_text,
          translated_text
        ) values ($1, 'en', 'pl', $2, $3, $4)
        returning original_text`,
        [
          learnerOneId,
          "Where’s the café?",
          "where’s the café?",
          "Gdzie jest kawiarnia?",
        ],
      );
      expect(accepted.rows).toEqual([{ original_text: "Where’s the café?" }]);
    } finally {
      await database.close();
    }
  });
});
