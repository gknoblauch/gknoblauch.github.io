// Pickleball ranking logic — pure functions so they can be unit-tested and run
// in the browser. Two ratings are computed from the same game history:
//
//  - Elo: the classic chess-style rating. Everyone starts level; winners take
//    points from losers, more when the result was an upset. Win/loss only.
//
//  - DUPR-style: a club rating on DUPR's familiar 2.0–8.0 scale. It is the same
//    Elo idea but also weights the score margin (an 11–2 win moves ratings more
//    than an 11–9 one), the way DUPR does. It is NOT an official DUPR number —
//    that is proprietary and computed against the global player pool — just a
//    local rating that behaves similarly within our group.
//
// For doubles, each team's two ratings are averaged to predict the outcome, and
// both partners are nudged by the same amount.

export type GameFormat = "singles" | "doubles";

/** Which rating the standings are ranked by. */
export type RankMetric = "elo" | "dupr";

/** A single recorded game. Shape mirrors the Supabase `games` table row. */
export type Game = {
  id: string;
  played_on: string; // ISO date, e.g. "2026-10-15"
  created_at?: string; // ISO timestamp, used only as a tiebreaker for ordering
  format: GameFormat;
  team_a: string[]; // 1 name (singles) or 2 (doubles)
  team_b: string[];
  score_a: number;
  score_b: number;
};

/** A player's computed standing. */
export type Standing = {
  name: string;
  elo: number; // rounded Elo
  dupr: number; // DUPR-style rating, 2 decimals, on a 2.0–8.0 scale
  wins: number;
  losses: number;
  games: number;
  winPct: number; // 0–100, rounded
};

/** Starting Elo rating for a new player. */
export const START_RATING = 1000;

/** Elo K-factor — how much a single game can move a rating. */
export const K_FACTOR = 24;

// --- DUPR-style constants (a club rating, not official DUPR) ---
/** Starting DUPR-style rating for a new player (mid rec-level). */
export const DUPR_START = 3.5;
/** DUPR-style rating is clamped to this band. */
export const DUPR_MIN = 2.0;
export const DUPR_MAX = 8.0;
/** Step size on the 2.0–8.0 scale (kept small since the band is compact). */
export const DUPR_K = 0.1;
/** Spread constant: a ~1.0 rating gap ⇒ ~76% expected win for the favourite. */
export const DUPR_DIV = 2.0;

const average = (nums: number[]) => nums.reduce((s, n) => s + n, 0) / nums.length;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Logistic expected win probability for side A given both sides' averages. */
function expected(avgA: number, avgB: number, div: number): number {
  return 1 / (1 + 10 ** ((avgB - avgA) / div));
}

/**
 * Sort games oldest-first so ratings evolve in the order they were played.
 * Falls back to `created_at`, then `id`, to keep the order stable.
 */
export function sortGamesChronologically(games: Game[]): Game[] {
  return [...games].sort((a, b) => {
    if (a.played_on !== b.played_on) return a.played_on < b.played_on ? -1 : 1;
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

type Tally = {
  elo: number;
  dupr: number;
  wins: number;
  losses: number;
  games: number;
};

/**
 * Replay every game in chronological order and return each player's standing,
 * sorted by the chosen metric (desc), then win%, then games played, then name.
 */
export function computeStandings(
  games: Game[],
  metric: RankMetric = "elo",
): Standing[] {
  const players = new Map<string, Tally>();

  const ensure = (name: string): Tally => {
    let t = players.get(name);
    if (!t) {
      t = { elo: START_RATING, dupr: DUPR_START, wins: 0, losses: 0, games: 0 };
      players.set(name, t);
    }
    return t;
  };

  for (const game of sortGamesChronologically(games)) {
    const teamA = game.team_a.map(ensure);
    const teamB = game.team_b.map(ensure);
    if (teamA.length === 0 || teamB.length === 0) continue;

    // Ties are not expected in pickleball (win by 2), but guard anyway.
    const aWon = game.score_a > game.score_b;
    const bWon = game.score_b > game.score_a;
    const actualA = aWon ? 1 : bWon ? 0 : 0.5;
    const actualB = 1 - actualA;

    // Elo (win/loss only).
    const expEloA = expected(
      average(teamA.map((p) => p.elo)),
      average(teamB.map((p) => p.elo)),
      400,
    );
    const eloDeltaA = K_FACTOR * (actualA - expEloA);
    const eloDeltaB = K_FACTOR * (actualB - (1 - expEloA));

    // DUPR-style (score-margin weighted). A bigger win swings ratings more.
    const expDuprA = expected(
      average(teamA.map((p) => p.dupr)),
      average(teamB.map((p) => p.dupr)),
      DUPR_DIV,
    );
    const mov = Math.log(Math.abs(game.score_a - game.score_b) + 1);
    const duprDeltaA = DUPR_K * mov * (actualA - expDuprA);
    const duprDeltaB = DUPR_K * mov * (actualB - (1 - expDuprA));

    for (const p of teamA) {
      p.elo += eloDeltaA;
      p.dupr = clamp(p.dupr + duprDeltaA, DUPR_MIN, DUPR_MAX);
      p.games += 1;
      if (aWon) p.wins += 1;
      else if (bWon) p.losses += 1;
    }
    for (const p of teamB) {
      p.elo += eloDeltaB;
      p.dupr = clamp(p.dupr + duprDeltaB, DUPR_MIN, DUPR_MAX);
      p.games += 1;
      if (bWon) p.wins += 1;
      else if (aWon) p.losses += 1;
    }
  }

  const standings: Standing[] = [...players.entries()].map(([name, t]) => ({
    name,
    elo: Math.round(t.elo),
    dupr: Math.round(t.dupr * 100) / 100,
    wins: t.wins,
    losses: t.losses,
    games: t.games,
    winPct: t.games > 0 ? Math.round((t.wins / t.games) * 100) : 0,
  }));

  const key = (s: Standing) => (metric === "dupr" ? s.dupr : s.elo);
  standings.sort(
    (a, b) =>
      key(b) - key(a) ||
      b.winPct - a.winPct ||
      b.games - a.games ||
      a.name.localeCompare(b.name),
  );

  return standings;
}

/** Every distinct player name seen across all games, sorted alphabetically. */
export function allPlayerNames(games: Game[]): string[] {
  const names = new Set<string>();
  for (const g of games) {
    for (const n of g.team_a) names.add(n);
    for (const n of g.team_b) names.add(n);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
