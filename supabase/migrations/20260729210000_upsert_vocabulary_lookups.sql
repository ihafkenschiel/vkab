create function public.clean_vocabulary_original(p_original_text text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select normalize(
    btrim(
      regexp_replace(
        p_original_text,
        U&'[[:space:]\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF]+',
        ' ',
        'g'
      )
    ),
    NFC
  )
$$;

create function public.normalize_vocabulary_lookup(p_original_text text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(public.clean_vocabulary_original(p_original_text))
$$;

update public.vocabulary_entries
set
  original_text = public.clean_vocabulary_original(original_text),
  normalized_original_text = public.normalize_vocabulary_lookup(original_text);

with ranked_entries as (
  select
    id,
    row_number() over (
      partition by
        owner_id,
        source_language,
        target_language,
        normalized_original_text
      order by last_looked_up_at desc, created_at desc, id
    ) as lookup_rank,
    sum(lookup_count) over (
      partition by
        owner_id,
        source_language,
        target_language,
        normalized_original_text
    ) as combined_lookup_count,
    min(created_at) over (
      partition by
        owner_id,
        source_language,
        target_language,
        normalized_original_text
    ) as first_created_at,
    max(last_looked_up_at) over (
      partition by
        owner_id,
        source_language,
        target_language,
        normalized_original_text
    ) as latest_lookup_at
  from public.vocabulary_entries
), updated_entries as (
  update public.vocabulary_entries as entry
  set
    lookup_count = ranked.combined_lookup_count,
    created_at = ranked.first_created_at,
    last_looked_up_at = ranked.latest_lookup_at
  from ranked_entries as ranked
  where entry.id = ranked.id
    and ranked.lookup_rank = 1
  returning entry.id
)
delete from public.vocabulary_entries as entry
using ranked_entries as ranked
where entry.id = ranked.id
  and ranked.lookup_rank > 1;

alter table public.vocabulary_entries
add constraint vocabulary_lookup_identity_unique
unique (
  owner_id,
  source_language,
  target_language,
  normalized_original_text
);

create function public.save_vocabulary_entry(
  p_source_language text,
  p_target_language text,
  p_original_text text,
  p_translated_text text
)
returns public.vocabulary_entries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_owner_id uuid := auth.uid();
  display_original_text text := public.clean_vocabulary_original(
    p_original_text
  );
  lookup_identity text := public.normalize_vocabulary_lookup(
    p_original_text
  );
  saved_entry public.vocabulary_entries;
begin
  if current_owner_id is null then
    raise exception 'An authenticated learner is required.'
      using errcode = '42501';
  end if;

  insert into public.vocabulary_entries (
    owner_id,
    source_language,
    target_language,
    original_text,
    normalized_original_text,
    translated_text
  )
  values (
    current_owner_id,
    p_source_language,
    p_target_language,
    display_original_text,
    lookup_identity,
    p_translated_text
  )
  on conflict (
    owner_id,
    source_language,
    target_language,
    normalized_original_text
  )
  do update set
    original_text = excluded.original_text,
    translated_text = excluded.translated_text,
    lookup_count = vocabulary_entries.lookup_count + 1,
    last_looked_up_at = greatest(
      statement_timestamp(),
      vocabulary_entries.last_looked_up_at + interval '1 microsecond'
    )
  returning * into saved_entry;

  return saved_entry;
end;
$$;

revoke all privileges
on function public.save_vocabulary_entry(text, text, text, text)
from public, anon, authenticated;

grant execute
on function public.save_vocabulary_entry(text, text, text, text)
to authenticated;

revoke all privileges
on function public.clean_vocabulary_original(text)
from public, anon, authenticated;

revoke all privileges
on function public.normalize_vocabulary_lookup(text)
from public, anon, authenticated;

grant execute
on function public.clean_vocabulary_original(text)
to authenticated;

grant execute
on function public.normalize_vocabulary_lookup(text)
to authenticated;

revoke all privileges
on table public.vocabulary_entries
from public, anon, authenticated;

grant select, insert, update, delete
on table public.vocabulary_entries
to authenticated;
