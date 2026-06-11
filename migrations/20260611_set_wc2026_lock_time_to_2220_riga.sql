-- Set fixed lock time for WC-2026 picks:
-- 11 Jun 2026 22:20 Europe/Riga = 2026-06-11 19:20:00+00

update pickem_competitions
set group_lock_at = '2026-06-11T19:20:00Z'::timestamptz
where slug = 'wc-2026';
