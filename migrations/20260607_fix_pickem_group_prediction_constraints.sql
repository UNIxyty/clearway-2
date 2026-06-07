-- Fix legacy/incorrect unique constraints on group predictions.
-- Current app writes one row per (user, competition, group, team) and enforces
-- unique predicted position within the same group.

-- Drop known legacy constraint variants if they exist.
alter table if exists pickem_user_group_predictions
  drop constraint if exists pickem_user_group_predictions_user_id_competition_id_group_key;

alter table if exists pickem_user_group_predictions
  drop constraint if exists pickem_user_group_predictions_user_id_competition_id_group_code_key;

-- Remove duplicate rows that would block new constraints.
with ranked_team as (
  select
    ctid,
    row_number() over (
      partition by user_id, competition_id, group_code, team_id
      order by updated_at desc nulls last
    ) as rn
  from pickem_user_group_predictions
)
delete from pickem_user_group_predictions p
using ranked_team r
where p.ctid = r.ctid
  and r.rn > 1;

with ranked_position as (
  select
    ctid,
    row_number() over (
      partition by user_id, competition_id, group_code, predicted_position
      order by updated_at desc nulls last
    ) as rn
  from pickem_user_group_predictions
)
delete from pickem_user_group_predictions p
using ranked_position r
where p.ctid = r.ctid
  and r.rn > 1;

do $$
declare
  existing_pk_name text;
  existing_pk_columns text[];
begin
  select
    c.conname,
    array_agg(a.attname order by u.ordinality)
  into existing_pk_name, existing_pk_columns
  from pg_constraint c
  join unnest(c.conkey) with ordinality as u(attnum, ordinality) on true
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = u.attnum
  where c.conrelid = 'pickem_user_group_predictions'::regclass
    and c.contype = 'p'
  group by c.conname;

  if existing_pk_name is null then
    alter table pickem_user_group_predictions
      add constraint pickem_user_group_predictions_pk
      primary key (user_id, competition_id, group_code, team_id);
  elsif existing_pk_columns <> array['user_id', 'competition_id', 'group_code', 'team_id'] then
    execute format(
      'alter table pickem_user_group_predictions drop constraint %I',
      existing_pk_name
    );
    alter table pickem_user_group_predictions
      add constraint pickem_user_group_predictions_pk
      primary key (user_id, competition_id, group_code, team_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pickem_user_group_predictions_unique_position'
  ) then
    alter table pickem_user_group_predictions
      add constraint pickem_user_group_predictions_unique_position
      unique (user_id, competition_id, group_code, predicted_position);
  end if;
end $$;

create index if not exists pickem_user_group_predictions_competition_idx
  on pickem_user_group_predictions (competition_id, user_id);
