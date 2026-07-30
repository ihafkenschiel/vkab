create table public.vocabulary_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_language text not null,
  target_language text not null,
  original_text text not null,
  normalized_original_text text not null,
  translated_text text not null,
  lookup_count integer not null default 1,
  created_at timestamptz not null default now(),
  last_looked_up_at timestamptz not null default now(),
  constraint vocabulary_supported_source
    check (source_language in ('en', 'pl')),
  constraint vocabulary_supported_target
    check (target_language in ('en', 'pl')),
  constraint vocabulary_direction_differs
    check (source_language <> target_language),
  constraint vocabulary_original_not_blank
    check (original_text ~ '[^[:space:]]'),
  constraint vocabulary_normalized_not_blank
    check (normalized_original_text ~ '[^[:space:]]'),
  constraint vocabulary_translation_not_blank
    check (translated_text ~ '[^[:space:]]'),
  constraint vocabulary_lookup_count_positive
    check (lookup_count >= 1),
  constraint vocabulary_timestamp_order
    check (last_looked_up_at >= created_at)
);

alter table public.vocabulary_entries enable row level security;
alter table public.vocabulary_entries force row level security;

create policy vocabulary_select_own
on public.vocabulary_entries
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy vocabulary_insert_own
on public.vocabulary_entries
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy vocabulary_update_own
on public.vocabulary_entries
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy vocabulary_delete_own
on public.vocabulary_entries
for delete
to authenticated
using ((select auth.uid()) = owner_id);
