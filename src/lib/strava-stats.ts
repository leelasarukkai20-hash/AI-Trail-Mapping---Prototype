/**
 * Cached per-user Strava activity summary (rate-limit safety).
 *
 * Before this existed, every homepage load (/api/strava/me) and every prompt
 * from a connected user (/api/recommend) did a live 90-day activity pull —
 * up to ~11 Strava requests each — against app-level limits of roughly
 * 100 reads/15 min and 1,000 reads/day. With a few dozen pilot users that
 * budget is gone in an afternoon.
 *
 * getStravaSummary() serves the summary from the columns on `strava_tokens`
 * and only talks to Strava when the cache is older than STATS_TTL_MS. If
 * Strava is rate-limiting (429) or otherwise failing, it serves the stale
 * cache instead of erroring — a runner's 90-day average pace doesn't change
 * meaningfully in half a day, let alone during an outage.
 *
 * The proper long-term fix is webhook-driven refresh (see NEXT_STEPS.md);
 * this cache makes the pilot safe without it.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "./db/client";
import { getAthlete, getFreshTokens, getRecentRuns } from "./strava";
import { loadStravaTokens, saveStravaTokens } from "./strava-store";
import { avgPaceFromRuns } from "./pace";

const STATS_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface StravaSummary {
  athleteName: string | null;
  avgPaceMinPerKm: number | null; // null = connected but no usable runs
  runsLast90: number;
  milesLast90: number;
  refreshedAt: Date;
  /** True when the TTL expired but Strava was unavailable, so this is the last good data. */
  stale: boolean;
}

type StatsRow = {
  athleteName: string | null;
  avgPaceMinPerKm: number | null;
  runsLast90: number | null;
  metersLast90: number | null;
  statsRefreshedAt: Date | null;
};

function toSummary(row: StatsRow, stale: boolean): StravaSummary | null {
  if (row.statsRefreshedAt == null) return null; // never computed
  return {
    athleteName: row.athleteName,
    avgPaceMinPerKm: row.avgPaceMinPerKm,
    runsLast90: row.runsLast90 ?? 0,
    milesLast90: Math.round(((row.metersLast90 ?? 0) / 1609.34) * 10) / 10,
    refreshedAt: row.statsRefreshedAt,
    stale,
  };
}

/**
 * The user's cached 90-day summary, refreshing from Strava only when the
 * cache is missing or older than the TTL.
 *
 * Returns null when the user has no Strava connection, or when the first-ever
 * refresh fails (nothing cached to fall back on).
 */
export async function getStravaSummary(userId: string): Promise<StravaSummary | null> {
  const [row] = await db
    .select({
      athleteName: schema.stravaTokens.athleteName,
      avgPaceMinPerKm: schema.stravaTokens.avgPaceMinPerKm,
      runsLast90: schema.stravaTokens.runsLast90,
      metersLast90: schema.stravaTokens.metersLast90,
      statsRefreshedAt: schema.stravaTokens.statsRefreshedAt,
    })
    .from(schema.stravaTokens)
    .where(eq(schema.stravaTokens.userId, userId))
    .limit(1);
  if (!row) return null; // not connected

  const fresh =
    row.statsRefreshedAt != null &&
    Date.now() - row.statsRefreshedAt.getTime() < STATS_TTL_MS;
  if (fresh) return toSummary(row, false);

  try {
    return await refreshStats(userId);
  } catch (e) {
    // Rate-limited or Strava down: last good data beats an error.
    console.error(`strava-stats refresh failed for ${userId}:`, e);
    return toSummary(row, true);
  }
}

/** Pull from Strava, recompute, persist, and return the fresh summary. */
async function refreshStats(userId: string): Promise<StravaSummary | null> {
  const stored = await loadStravaTokens(userId);
  if (!stored) return null;

  const tokens = await getFreshTokens(stored);
  if (tokens.access_token !== stored.access_token) {
    await saveStravaTokens(userId, tokens);
  }

  const [athlete, runs] = await Promise.all([
    getAthlete(tokens.access_token),
    getRecentRuns(tokens.access_token),
  ]);

  const refreshedAt = new Date();
  const metersLast90 = runs.reduce((s, r) => s + r.distance, 0);
  const stats = {
    athleteName: `${athlete.firstname} ${athlete.lastname}`.trim() || null,
    avgPaceMinPerKm: avgPaceFromRuns(runs),
    runsLast90: runs.length,
    metersLast90,
    statsRefreshedAt: refreshedAt,
  };
  await db
    .update(schema.stravaTokens)
    .set(stats)
    .where(eq(schema.stravaTokens.userId, userId));

  return toSummary(stats, false);
}
