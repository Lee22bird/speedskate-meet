-- ============================================================================
-- SSL profile check/backfill for the two users who don't appear in name search:
--   Matthew Towne 2nd  (sendamayaemail@gmail.com)
--   Camaron Mayo       (smayo724@gmail.com)
-- Run in the SSL/MSSL Supabase SQL editor. Mirrors the handle_new_user() trigger.
-- ============================================================================

-- STEP 1 — DIAGNOSE. Do they have a profile row? Is full_name/team/league filled?
-- (No row, or blank full_name = why the name search can't find them.)
select u.email, u.id, p.full_name, p.team, p.league, p.role, p.approval_status, p.team_status
from auth.users u
left join public.profiles p on p.id = u.id
where lower(u.email) in ('sendamayaemail@gmail.com', 'smayo724@gmail.com');

-- STEP 2 — BACKFILL. We set ssl_skater_id EXPLICITLY (current max + row number) so
-- we don't hit the out-of-sync default counter that grabs an already-used SSL-0000NN.
with v(email, fallback_name, team, league, ord) as (
  values
    ('sendamayaemail@gmail.com', 'Matthew Towne 2nd', 'Midwest Racing', 'MSSL', 1),
    ('smayo724@gmail.com',       'Camaron Mayo',      'DFW Speed',      'MSSL', 2)
),
maxid as (
  select coalesce(max((regexp_replace(ssl_skater_id, '\D', '', 'g'))::int), 0) as n
  from public.profiles
  where ssl_skater_id ~ '^SSL-\d+$'
)
insert into public.profiles (id, ssl_skater_id, full_name, team, league, role, roles, approval_status, team_status)
select
  u.id,
  'SSL-' || lpad((maxid.n + v.ord)::text, 6, '0'),
  coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
           nullif(trim(u.raw_user_meta_data->>'name'), ''),
           v.fallback_name),
  v.team, v.league, 'skater', '{}'::text[], 'approved',
  case when v.team is null then 'unplaced' else 'active' end
from v
join auth.users u on lower(u.email) = lower(v.email)
cross join maxid
on conflict (id) do update set
  full_name   = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
  team        = coalesce(nullif(public.profiles.team,   ''), excluded.team),
  league      = coalesce(nullif(public.profiles.league, ''), excluded.league),
  team_status = coalesce(nullif(public.profiles.team_status, ''), excluded.team_status);

-- STEP 3 — VERIFY: re-run STEP 1.
