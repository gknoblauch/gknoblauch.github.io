# Pickleball page — one-time setup

The `/pickleball` page stores games in a free Supabase project. Reads are public
(friends just open the page); adding a game requires a shared **passcode** that's
checked inside the database. Here's the ~10-minute setup.

## 1. Create a Supabase project
1. Go to <https://supabase.com>, sign up (free), and create a new project.
2. Pick any name/region; wait a minute for it to provision.

## 2. Create the table + passcode-guarded insert
1. In the project, open **SQL Editor → New query**.
2. Open [`pickleball-setup.sql`](./pickleball-setup.sql), change `CHANGE_ME` to
   your chosen passcode (the one you'll share with whoever records games), paste
   the whole file in, and click **Run**.

This creates the `games` table, makes it publicly readable, and adds an
`add_game()` function that only inserts when the passcode matches.

## 3. Connect the site
1. In Supabase: **Project Settings → API**. Copy the **Project URL** and the
   **anon public** key.
2. In this repo, open [`src/lib/supabase.ts`](./src/lib/supabase.ts) and replace
   the two placeholders:
   ```ts
   export const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
   export const SUPABASE_ANON_KEY = "YOUR_ANON_PUBLIC_KEY";
   ```
   Both values are safe to commit — the anon key is a public key, and the table's
   security is enforced by the passcode in the database, not by hiding the key.
3. Commit and push to `master`. GitHub Actions rebuilds and deploys automatically.

## Using it
- **View standings:** anyone opens `/pickleball`. No login.
- **Add a game:** fill in the teams + scores, enter the passcode, hit **Add game**.
  The passcode is remembered in your browser so you only type it once per device.
- **Fix a typo / delete a bad game:** Supabase dashboard → **Table Editor →
  games**. Edit or delete rows directly like a spreadsheet; the page updates on
  refresh.

## Tuning (optional)
All in [`src/lib/pickleball.ts`](./src/lib/pickleball.ts):
- `START_RATING` (default `1000`) — everyone's starting rating.
- `K_FACTOR` (default `24`) — how much one game moves a rating. Higher = swingier.

Ratings are a simplified Elo: one combined rating across singles and doubles,
based on wins/losses and opponent strength (margin of victory isn't counted).
These are easy to change later if you want separate singles/doubles ratings or
score-margin weighting.
