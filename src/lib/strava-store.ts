/**
 * Per-user Strava token store, backed by the `strava_tokens` table in Postgres.
 * Replaces the signed-cookie scaffold (`src/lib/oauth-state.ts` now holds CSRF
 * state only). Tokens never leave the server.
 *
 * Time convention:
 *   - StravaTokens.expires_at is unix SECONDS (Strava's wire format).
 *   - The DB column `expires_at` is `timestamptz`.
 *   - save: `new Date(expires_at * 1000)`
 *   - load: `Math.floor(row.expiresAt.getTime() / 1000)`
 *
 * Athlete name is NOT stored here (decision: re-fetch in `/api/strava/me` via
 * `getAthlete()`). Only the stable `athlete_id` is persisted.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "./db/client";
import type { StravaTokens } from "./strava";

export async function saveStravaTokens(userId: string, tokens: StravaTokens): Promise<void> {
  const row = {
    userId,
    athleteId: tokens.athlete?.id ?? null,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expires_at * 1000),
    scope: tokens.scope ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.stravaTokens)
    .values(row)
    .onConflictDoUpdate({
      target: schema.stravaTokens.userId,
      set: {
        // Don't overwrite athleteId with null on refresh (Strava only returns
        // the athlete object on the initial code exchange, not on refresh).
        ...(row.athleteId != null ? { athleteId: row.athleteId } : {}),
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
        expiresAt: row.expiresAt,
        ...(row.scope != null ? { scope: row.scope } : {}),
        updatedAt: row.updatedAt,
      },
    });
}

export async function loadStravaTokens(userId: string): Promise<StravaTokens | null> {
  const [row] = await db
    .select()
    .from(schema.stravaTokens)
    .where(eq(schema.stravaTokens.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    access_token: row.accessToken,
    refresh_token: row.refreshToken,
    expires_at: Math.floor(row.expiresAt.getTime() / 1000),
    scope: row.scope ?? undefined,
    athlete: row.athleteId != null ? { id: row.athleteId, firstname: "", lastname: "" } : undefined,
  };
}

export async function clearStravaTokens(userId: string): Promise<void> {
  await db.delete(schema.stravaTokens).where(eq(schema.stravaTokens.userId, userId));
}
