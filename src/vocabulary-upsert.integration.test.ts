import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const learnerOneId = "11111111-1111-4111-8111-111111111111";
const learnerTwoId = "22222222-2222-4222-8222-222222222222";
const migrationDirectory = resolve(process.cwd(), "supabase/migrations");

async function initializeAuthentication(database: PGlite) {
  await database.exec(`
    create schema auth;
    create role authenticated nologin;
    create role anon nologin;
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
    grant usage on schema auth to authenticated, anon;
  `);
}

async function createVocabularyDatabase() {
  const database = await PGlite.create();
  await initializeAuthentication(database);

  const migrations = readdirSync(migrationDirectory).sort();

  for (const [index, filename] of migrations.entries()) {
    let migration = readFileSync(resolve(migrationDirectory, filename), "utf8");

    if (index === 0) {
      await database.exec(migration);
      await database.exec(`
        grant select, insert, update, delete
          on table public.vocabulary_entries
          to anon;
      `);
      continue;
    }

    const functionRevoke = `revoke all privileges
on function public.save_vocabulary_entry(text, text, text, text)`;
    migration = migration.replace(
      functionRevoke,
      `grant execute
on function public.save_vocabulary_entry(text, text, text, text)
to anon;

${functionRevoke}`,
    );

    await database.exec(migration);
  }

  return database;
}

async function queryAsAnonymous(database: PGlite, sql: string) {
  await database.exec("begin");

  try {
    await database.exec("set local role anon");
    const result = await database.query(sql);
    await database.exec("commit");
    return result;
  } catch (error) {
    await database.exec("rollback");
    throw error;
  }
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

describe("atomic vocabulary lookup save", () => {
  it("canonicalizes and consolidates legacy browser identities before enforcing uniqueness", async () => {
    const database = await PGlite.create();
    const migrations = readdirSync(migrationDirectory).sort();

    try {
      await initializeAuthentication(database);
      await database.exec(
        readFileSync(resolve(migrationDirectory, migrations[0]), "utf8"),
      );
      await database.exec(`
        insert into public.vocabulary_entries (
          owner_id,
          source_language,
          target_language,
          original_text,
          normalized_original_text,
          translated_text,
          lookup_count,
          created_at,
          last_looked_up_at
        ) values
          (
            '${learnerOneId}', 'en', 'pl', U&'istanbul\\FEFF taxi', 'istanbul taxi',
            'Taksówka w Stambule', 2,
            '2026-07-28T10:00:00Z', '2026-07-28T11:00:00Z'
          ),
          (
            '${learnerOneId}', 'en', 'pl', U&'\\0130STANBUL TAXI', U&'i\\0307stanbul taxi',
            'Taksówka w Stambule!', 3,
            '2026-07-29T10:00:00Z', '2026-07-29T11:00:00Z'
          );
      `);

      await database.exec(
        readFileSync(resolve(migrationDirectory, migrations[1]), "utf8"),
      );

      const entries = await database.query<{
        original_text: string;
        normalized_original_text: string;
        translated_text: string;
        lookup_count: number;
        created_at: Date;
        last_looked_up_at: Date;
      }>(`
        select
          original_text,
          normalized_original_text,
          translated_text,
          lookup_count,
          created_at,
          last_looked_up_at
        from public.vocabulary_entries
      `);
      expect(entries.rows).toEqual([
        {
          original_text: "İSTANBUL TAXI",
          normalized_original_text: "istanbul taxi",
          translated_text: "Taksówka w Stambule!",
          lookup_count: 5,
          created_at: new Date("2026-07-28T10:00:00Z"),
          last_looked_up_at: new Date("2026-07-29T11:00:00Z"),
        },
      ]);

      const repeated = await queryAsUser<{
        normalized_original_text: string;
        translated_text: string;
        lookup_count: number;
      }>(
        database,
        learnerOneId,
        "select normalized_original_text, translated_text, lookup_count from public.save_vocabulary_entry('en', 'pl', $1, $2)",
        ["İstanbul\uFEFF taxi", "Stambuł taxi"],
      );
      expect(repeated.rows).toEqual([
        {
          normalized_original_text: "istanbul taxi",
          translated_text: "Stambuł taxi",
          lookup_count: 6,
        },
      ]);

      const rowCount = await queryAsUser<{ count: number }>(
        database,
        learnerOneId,
        "select count(*)::integer as count from public.vocabulary_entries",
      );
      expect(rowCount.rows).toEqual([{ count: 1 }]);
    } finally {
      await database.close();
    }
  });

  it("exposes the owner-free save boundary only to authenticated learners", async () => {
    const database = await createVocabularyDatabase();

    try {
      const signature = await database.query<{
        argument_names: string[];
        security_definer: boolean;
      }>(`
        select
          proargnames as argument_names,
          prosecdef as security_definer
        from pg_proc
        where oid = 'public.save_vocabulary_entry(text, text, text, text)'::regprocedure
      `);
      expect(signature.rows).toEqual([
        {
          argument_names: [
            "p_source_language",
            "p_target_language",
            "p_original_text",
            "p_translated_text",
          ],
          security_definer: false,
        },
      ]);

      const privileges = await database.query<{
        role_name: string;
        can_execute_save: boolean;
        can_select_entries: boolean;
        can_insert_entries: boolean;
        can_update_entries: boolean;
        can_delete_entries: boolean;
        can_truncate_entries: boolean;
        can_reference_entries: boolean;
        can_trigger_entries: boolean;
      }>(`
        select
          role_name,
          has_function_privilege(
            role_name,
            'public.save_vocabulary_entry(text, text, text, text)',
            'execute'
          ) as can_execute_save,
          has_table_privilege(role_name, 'public.vocabulary_entries', 'select')
            as can_select_entries,
          has_table_privilege(role_name, 'public.vocabulary_entries', 'insert')
            as can_insert_entries,
          has_table_privilege(role_name, 'public.vocabulary_entries', 'update')
            as can_update_entries,
          has_table_privilege(role_name, 'public.vocabulary_entries', 'delete')
            as can_delete_entries,
          has_table_privilege(role_name, 'public.vocabulary_entries', 'truncate')
            as can_truncate_entries,
          has_table_privilege(role_name, 'public.vocabulary_entries', 'references')
            as can_reference_entries,
          has_table_privilege(role_name, 'public.vocabulary_entries', 'trigger')
            as can_trigger_entries
        from (values ('authenticated'), ('anon')) as roles(role_name)
        order by role_name
      `);
      expect(privileges.rows).toEqual([
        {
          role_name: "anon",
          can_execute_save: false,
          can_select_entries: false,
          can_insert_entries: false,
          can_update_entries: false,
          can_delete_entries: false,
          can_truncate_entries: false,
          can_reference_entries: false,
          can_trigger_entries: false,
        },
        {
          role_name: "authenticated",
          can_execute_save: true,
          can_select_entries: true,
          can_insert_entries: true,
          can_update_entries: true,
          can_delete_entries: true,
          can_truncate_entries: false,
          can_reference_entries: false,
          can_trigger_entries: false,
        },
      ]);

      await expect(
        queryAsAnonymous(
          database,
          "select id from public.save_vocabulary_entry('en', 'pl', 'Hello', 'Cześć')",
        ),
      ).rejects.toThrow(/permission denied for function save_vocabulary_entry/i);
    } finally {
      await database.close();
    }
  });

  it("uses one Unicode identity while preserving cleaned text for display", async () => {
    const database = await createVocabularyDatabase();

    try {
      const composed = await queryAsUser<{
        original_text: string;
        normalized_original_text: string;
        lookup_count: number;
      }>(
        database,
        learnerOneId,
        "select original_text, normalized_original_text, lookup_count from public.save_vocabulary_entry('en', 'pl', $1, $2)",
        ["  CAFÉ \t au   lait  ", "Kawa z mlekiem"],
      );
      const decomposed = await queryAsUser<{
        original_text: string;
        normalized_original_text: string;
        lookup_count: number;
      }>(
        database,
        learnerOneId,
        "select original_text, normalized_original_text, lookup_count from public.save_vocabulary_entry('en', 'pl', $1, $2)",
        ["cafe\u0301 au lait", "Kawa z mlekiem"],
      );

      expect(composed.rows).toEqual([
        {
          original_text: "CAFÉ au lait",
          normalized_original_text: "café au lait",
          lookup_count: 1,
        },
      ]);
      expect(decomposed.rows).toEqual([
        {
          original_text: "café au lait",
          normalized_original_text: "café au lait",
          lookup_count: 2,
        },
      ]);
    } finally {
      await database.close();
    }
  });

  it("refreshes one existing lookup and returns its new translation, count, and timestamp", async () => {
    const database = await createVocabularyDatabase();

    try {
      const first = await queryAsUser<{
        id: string;
        translated_text: string;
        lookup_count: number;
        last_looked_up_at: Date;
      }>(
        database,
        learnerOneId,
        "select id, translated_text, lookup_count, last_looked_up_at from public.save_vocabulary_entry('en', 'pl', $1, $2)",
        ["Good morning", "Dzień dobry"],
      );
      const repeated = await queryAsUser<{
        id: string;
        translated_text: string;
        lookup_count: number;
        last_looked_up_at: Date;
      }>(
        database,
        learnerOneId,
        "select id, translated_text, lookup_count, last_looked_up_at from public.save_vocabulary_entry('en', 'pl', $1, $2)",
        ["GOOD MORNING", "Dzień dobry!"],
      );

      expect(repeated.rows[0]).toMatchObject({
        id: first.rows[0].id,
        translated_text: "Dzień dobry!",
        lookup_count: 2,
      });
      expect(repeated.rows[0].last_looked_up_at.getTime()).toBeGreaterThan(
        first.rows[0].last_looked_up_at.getTime(),
      );

      const stored = await queryAsUser<{
        translated_text: string;
        lookup_count: number;
      }>(
        database,
        learnerOneId,
        "select translated_text, lookup_count from public.vocabulary_entries",
      );
      expect(stored.rows).toEqual([
        { translated_text: "Dzień dobry!", lookup_count: 2 },
      ]);
    } finally {
      await database.close();
    }
  });

  it("keeps reverse directions and different learners as separate lookups", async () => {
    const database = await createVocabularyDatabase();

    try {
      await queryAsUser(
        database,
        learnerOneId,
        "select id from public.save_vocabulary_entry('en', 'pl', 'Reserved', 'Zarezerwowane')",
      );
      await queryAsUser(
        database,
        learnerOneId,
        "select id from public.save_vocabulary_entry('pl', 'en', 'Reserved', 'Reserved')",
      );
      await queryAsUser(
        database,
        learnerTwoId,
        "select id from public.save_vocabulary_entry('en', 'pl', 'Reserved', 'Zarezerwowane')",
      );

      const learnerOneRows = await queryAsUser<{
        owner_id: string;
        source_language: string;
        target_language: string;
        lookup_count: number;
      }>(
        database,
        learnerOneId,
        "select owner_id, source_language, target_language, lookup_count from public.vocabulary_entries order by source_language",
      );
      const learnerTwoRows = await queryAsUser<{
        owner_id: string;
        lookup_count: number;
      }>(
        database,
        learnerTwoId,
        "select owner_id, lookup_count from public.vocabulary_entries",
      );

      expect(learnerOneRows.rows).toEqual([
        {
          owner_id: learnerOneId,
          source_language: "en",
          target_language: "pl",
          lookup_count: 1,
        },
        {
          owner_id: learnerOneId,
          source_language: "pl",
          target_language: "en",
          lookup_count: 1,
        },
      ]);
      expect(learnerTwoRows.rows).toEqual([
        { owner_id: learnerTwoId, lookup_count: 1 },
      ]);
    } finally {
      await database.close();
    }
  });

  it("increments exactly once for every overlapping duplicate save", async () => {
    const database = await createVocabularyDatabase();

    try {
      await database.exec("set role authenticated");
      await database.query(
        "select set_config('request.jwt.claim.sub', $1, false)",
        [learnerOneId],
      );

      const saves = Array.from({ length: 8 }, (_, index) =>
        database.query<{
          id: string;
          lookup_count: number;
        }>(
          "select id, lookup_count from public.save_vocabulary_entry('en', 'pl', $1, $2)",
          [index % 2 === 0 ? "  Taxi   please " : "TAXI PLEASE", `Taxi ${index}`],
        ),
      );
      const results = await Promise.all(saves);

      expect(
        new Set(
          results.flatMap((result) => result.rows.map((row) => row.id)),
        ).size,
      ).toBe(1);

      const stored = await database.query<{
        lookup_count: number;
      }>(
        "select lookup_count from public.vocabulary_entries",
      );
      expect(stored.rows).toEqual([{ lookup_count: 8 }]);
    } finally {
      await database.close();
    }
  });

  it("moves a repeated lookup ahead of newer vocabulary", async () => {
    const database = await createVocabularyDatabase();

    try {
      await queryAsUser(
        database,
        learnerOneId,
        "select id from public.save_vocabulary_entry('en', 'pl', 'Good morning', 'Dzień dobry')",
      );
      await queryAsUser(
        database,
        learnerOneId,
        "select id from public.save_vocabulary_entry('en', 'pl', 'Train station', 'Stacja kolejowa')",
      );
      await queryAsUser(
        database,
        learnerOneId,
        "select id from public.save_vocabulary_entry('en', 'pl', 'GOOD MORNING', 'Dzień dobry')",
      );

      const ordered = await queryAsUser<{
        normalized_original_text: string;
        lookup_count: number;
      }>(
        database,
        learnerOneId,
        "select normalized_original_text, lookup_count from public.vocabulary_entries order by last_looked_up_at desc",
      );
      expect(ordered.rows).toEqual([
        { normalized_original_text: "good morning", lookup_count: 2 },
        { normalized_original_text: "train station", lookup_count: 1 },
      ]);
    } finally {
      await database.close();
    }
  });
});
