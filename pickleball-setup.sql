-- Pickleball ranking — Supabase setup.
-- Paste this whole file into your Supabase project's SQL editor and run it.
-- Before running, change 'CHANGE_ME' below to the shared passcode you'll give
-- the people allowed to record games.

-- 1. Games table ----------------------------------------------------------
create table if not exists public.games (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  played_on  date not null,
  format     text not null check (format in ('singles','doubles')),
  team_a     text[] not null,   -- 1 name for singles, 2 for doubles
  team_b     text[] not null,
  score_a    int not null,
  score_b    int not null
);

-- 2. Row Level Security: anyone may read; nobody may write directly --------
alter table public.games enable row level security;

drop policy if exists "public read" on public.games;
create policy "public read" on public.games
  for select using (true);
-- No insert/update/delete policy exists, so direct writes are denied for the
-- public anon key. Writes only happen through the function below.

-- 3. Passcode-guarded insert ----------------------------------------------
create or replace function public.add_game(
  p_passcode  text,
  p_played_on date,
  p_format    text,
  p_team_a    text[],
  p_team_b    text[],
  p_score_a   int,
  p_score_b   int
) returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  the_row public.games;
begin
  if p_passcode is distinct from 'CHANGE_ME' then
    raise exception 'Invalid passcode';
  end if;
  if p_format not in ('singles','doubles') then
    raise exception 'Invalid format';
  end if;

  insert into public.games (played_on, format, team_a, team_b, score_a, score_b)
  values (p_played_on, p_format, p_team_a, p_team_b, p_score_a, p_score_b)
  returning * into the_row;

  return the_row;
end;
$$;

-- Let the public anon key call the function; keep direct table writes blocked.
revoke execute on function
  public.add_game(text, date, text, text[], text[], int, int) from public;
grant execute on function
  public.add_game(text, date, text, text[], text[], int, int) to anon;

-- 4. Passcode-guarded delete (for removing a game from the page) -----------
create or replace function public.delete_game(
  p_passcode text,
  p_id       uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_passcode is distinct from 'CHANGE_ME' then
    raise exception 'Invalid passcode';
  end if;
  delete from public.games where id = p_id;
end;
$$;

revoke execute on function public.delete_game(text, uuid) from public;
grant execute on function public.delete_game(text, uuid) to anon;
