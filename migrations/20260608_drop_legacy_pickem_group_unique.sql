-- Drop any legacy unique constraint that enforces one row per group
-- (user_id, competition_id, group_code). Current model requires one row per team.

do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'pickem_user_group_predictions'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text order by k.ord)
        from unnest(c.conkey) with ordinality as k(attnum, ord)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = k.attnum
      ) = array['user_id', 'competition_id', 'group_code']::text[]
  loop
    execute format(
      'alter table pickem_user_group_predictions drop constraint %I',
      rec.conname
    );
  end loop;
end $$;

-- Ensure expected constraints exist.
do $$
declare
  existing_pk_name text;
  existing_pk_columns text[];
begin
  select
    c.conname,
    array_agg(a.attname::text order by u.ordinality)
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
  elsif existing_pk_columns <> array['user_id', 'competition_id', 'group_code', 'team_id']::text[] then
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
    where conrelid = 'pickem_user_group_predictions'::regclass
      and conname = 'pickem_user_group_predictions_unique_position'
  ) then
    alter table pickem_user_group_predictions
      add constraint pickem_user_group_predictions_unique_position
      unique (user_id, competition_id, group_code, predicted_position);
  end if;
end $$;

