import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260729190000_create_vocabulary_entries.sql",
);

function readMigration() {
  return readFileSync(migrationPath, "utf8")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tableDefinition(sql: string) {
  const match = sql.match(
    /create table public\.vocabulary_entries \((.*?)\);/,
  );

  if (!match) {
    throw new Error("vocabulary_entries table definition is missing");
  }

  return match[1];
}

function policyDefinitions(sql: string) {
  return Object.fromEntries(
    [...sql.matchAll(
      /create policy (\w+) on public\.vocabulary_entries for (select|insert|update|delete) to authenticated (.*?);/g,
    )].map((match) => [
      match[2],
      { name: match[1], condition: match[3].trim() },
    ]),
  );
}

describe("vocabulary migration contract", () => {
  it("defines owned en/pl vocabulary rows with required content, count, and timestamp constraints", () => {
    const definition = tableDefinition(readMigration());

    expect(definition).toMatch(
      /id uuid primary key default gen_random_uuid\(\)/,
    );
    expect(definition).toMatch(
      /owner_id uuid not null references auth\.users \(id\) on delete cascade/,
    );
    expect(definition).toMatch(/source_language text not null/);
    expect(definition).toMatch(/target_language text not null/);
    expect(definition).toMatch(/original_text text not null/);
    expect(definition).toMatch(/normalized_original_text text not null/);
    expect(definition).toMatch(/translated_text text not null/);
    expect(definition).toMatch(/lookup_count integer not null default 1/);
    expect(definition).toMatch(
      /created_at timestamptz not null default now\(\)/,
    );
    expect(definition).toMatch(
      /last_looked_up_at timestamptz not null default now\(\)/,
    );
    expect(definition).toContain(
      "constraint vocabulary_supported_source check (source_language in ('en', 'pl'))",
    );
    expect(definition).toContain(
      "constraint vocabulary_supported_target check (target_language in ('en', 'pl'))",
    );
    expect(definition).toContain(
      "constraint vocabulary_direction_differs check (source_language <> target_language)",
    );
    expect(definition).toContain(
      "constraint vocabulary_original_not_blank check (original_text ~ '[^[:space:]]')",
    );
    expect(definition).toContain(
      "constraint vocabulary_normalized_not_blank check (normalized_original_text ~ '[^[:space:]]')",
    );
    expect(definition).toContain(
      "constraint vocabulary_translation_not_blank check (translated_text ~ '[^[:space:]]')",
    );
    expect(definition).toContain(
      "constraint vocabulary_lookup_count_positive check (lookup_count >= 1)",
    );
    expect(definition).toContain(
      "constraint vocabulary_timestamp_order check (last_looked_up_at >= created_at)",
    );
  });

  it("forces row-level security with owner-only CRUD policies for anonymous authenticated users", () => {
    const sql = readMigration();

    expect(sql).toContain(
      "alter table public.vocabulary_entries enable row level security;",
    );
    expect(sql).toContain(
      "alter table public.vocabulary_entries force row level security;",
    );
    expect(policyDefinitions(sql)).toEqual({
      select: {
        name: "vocabulary_select_own",
        condition: "using ((select auth.uid()) = owner_id)",
      },
      insert: {
        name: "vocabulary_insert_own",
        condition: "with check ((select auth.uid()) = owner_id)",
      },
      update: {
        name: "vocabulary_update_own",
        condition:
          "using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)",
      },
      delete: {
        name: "vocabulary_delete_own",
        condition: "using ((select auth.uid()) = owner_id)",
      },
    });
  });
});
