do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'country_service_statuses_state_check'
      and conrelid = 'public.country_service_statuses'::regclass
  ) then
    alter table public.country_service_statuses
      drop constraint country_service_statuses_state_check;
  end if;
end $$;

alter table public.country_service_statuses
  add constraint country_service_statuses_state_check
  check (state in ('not_checked', 'in_work', 'partially_works', 'operational', 'issues'));
