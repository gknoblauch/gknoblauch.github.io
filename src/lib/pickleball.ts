// Pickleball ranking logic — pure functions so they can be unit-tested and run
// in the browser. The ranking is a simplified Elo (the same idea DUPR uses):
// everyone starts at the same rating, and after each game the winners gain and
// losers lose points scaled by how surprising the result was. For doubles we
// average each team's two ratings to predict the outcome, then nudge both
// partners by the same amount.

export type GameFormat = "singles" | "doubles";

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
  rating: number; // rounded Elo
  wins: number;
  losses: number;
  games: number;
  winPct: number; // 0–100, rounded
};

/** Starting Elo rating for a new player. */
export const START_RATING = 1000;

/** Elo K-factor — how much a single game can move a rating. */
export const K_FACTOR = 24;

const average = (nums: number[]) => nums.reduce((s, n) => s + n, 0) / nums.length;

/** Expected win probability for side A given both sides' average ratings. */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
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
  rating: number;
  wins: number;
  losses: number;
  games: number;
};

/**
 * Replay every game in chronological order and return each player's standing,
 * sorted by rating (desc), then win%, then games played.
 */
export function computeStandings(games: Game[]): Standing[] {
  const players = new Map<string, Tally>();

  const ensure = (name: string): Tally => {
    let t = players.get(name);
    if (!t) {
      t = { rating: START_RATING, wins: 0, losses: 0, games: 0 };
      players.set(name, t);
    }
    return t;
  };

  for (const game of sortGamesChronologically(games)) {
    const teamA = game.team_a.map(ensure);
    const teamB = game.team_b.map(ensure);
    if (teamA.length === 0 || teamB.length === 0) continue;

    const avgA = average(teamA.map((p) => p.rating));
    const avgB = average(teamB.map((p) => p.rating));

    const expA = expectedScore(avgA, avgB);
    const expB = 1 - expA;

    // Ties are not expected in pickleball (win by 2), but guard anyway.
    const aWon = game.score_a > game.score_b;
    const bWon = game.score_b > game.score_a;
    const actualA = aWon ? 1 : bWon ? 0 : 0.5;
    const actualB = 1 - actualA;

    const deltaA = K_FACTOR * (actualA - expA);
    const deltaB = K_FACTOR * (actualB - expB);

    for (const p of teamA) {
      p.rating += deltaA;
      p.games += 1;
      if (aWon) p.wins += 1;
      else if (bWon) p.losses += 1;
    }
    for (const p of teamB) {
      p.rating += deltaB;
      p.games += 1;
      if (bWon) p.wins += 1;
      else if (aWon) p.losses += 1;
    }
  }

  const standings: Standing[] = [...players.entries()].map(([name, t]) => ({
    name,
    rating: Math.round(t.rating),
    wins: t.wins,
    losses: t.losses,
    games: t.games,
    winPct: t.games > 0 ? Math.round((t.wins / t.games) * 100) : 0,
  }));

  standings.sort(
    (a, b) =>
      b.rating - a.rating ||
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
