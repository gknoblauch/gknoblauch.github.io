-- Supabase keep-alive heartbeat.
-- Paste this file into the pickleball project's SQL editor and run it once.
-- It is safe to re-run, does not change the passcode, and leaves no rows behind
-- in the games table.
--
-- Why: a daily read of the games table (GET /rest/v1/games) returned 200 every
-- day but still did not count as enough activity, and the free-tier project was
-- paused in November 2026. Each call to keepalive() now does real work on the
-- games table (insert + delete a throwaway row in one transaction, plus a
-- read) and bumps one row in public.keepalive as a visible heartbeat.

create table if not exists public.keepalive (
  id        int primary key default 1 check (id = 1),  -- always a single row
  pinged_at timestamptz not null default now(),
  pings     bigint not null default 0
);

-- Lock the table down: no policies, so the anon key cannot read or write it
-- directly. Only the function below touches it.
alter table public.keepalive enable row level security;

create or replace function public.keepalive()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  ts timestamptz;
  probe_id uuid;
begin
  -- Real write activity on the games table itself: insert a throwaway game and
  -- delete it again in the same transaction. Nobody else can ever see it (it
  -- is never committed as a visible row), so rankings and the game log are
  -- unaffected.
  insert into public.games (played_on, format, team_a, team_b, score_a, score_b)
  values (current_date, 'singles', array['__keepalive__'], array['__keepalive__'], 0, 0)
  returning id into probe_id;
  delete from public.games where id = probe_id;

  -- A plain read of games as well.
  perform count(*) from public.games;

  -- Heartbeat row, so you can see in the Table Editor when the last ping was.
  insert into public.keepalive (id, pinged_at, pings)
  values (1, now(), 1)
  on conflict (id) do update
    set pinged_at = excluded.pinged_at,
        pings     = public.keepalive.pings + 1
  returning pinged_at into ts;
  return ts;
end;
$$;

revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon;
