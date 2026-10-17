import { createClient } from "@supabase/supabase-js";

// Supabase connection for the pickleball page.
//
// Both of these values are safe to ship in client-side code:
//  - The project URL is public.
//  - The anon key is a public, publishable key. Row-Level Security on the
//    `games` table (see the SQL in the pickleball setup) is what actually
//    protects the data: anyone may read, but inserting a game requires the
//    shared passcode, which is checked server-side inside the `add_game`
//    Postgres function. The passcode is NOT stored here.
//
// Replace the two placeholders below with the values from your Supabase
// project (Project Settings → API).
export const SUPABASE_URL = "https://bxgrzgbelxuisjhiucts.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_-bTe9bRelo-7Ej6U3MGpsA_rf1oMrBv";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
