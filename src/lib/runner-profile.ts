/**
 * Self-reported runner profile — the cold-start fallback for users without
 * Strava (or who don't want to connect it).
 *
 * One number for now: an easy/flat pace in min/km. The recommend flow uses it
 * only when there's no Strava stats cache (see getEffectivePace in
 * api/recommend); connecting Strava always wins.
 *
 * Bounds: 2.5–15 min/km (~4:00–24:00 per mile) — wide enough for any real
 * runner or hiker, tight enough to reject unit mix-ups (e.g. someone posting
 * seconds or mph).
 */
import { eq } from "drizzle-orm";
import { db, schema } from "./db/client";

export const PACE_MIN_PER_KM_MIN = 2.5;
export const PACE_MIN_PER_KM_MAX = 15;

export function isValidPace(paceMinPerKm: unknown): paceMinPerKm is number {
  return (
    typeof paceMinPerKm === "number" &&
    Number.isFinite(paceMinPerKm) &&
    paceMinPerKm >= PACE_MIN_PER_KM_MIN &&
    paceMinPerKm <= PACE_MIN_PER_KM_MAX
  );
}

export async function getSelfReportedPace(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ pace: schema.runnerProfiles.selfReportedPaceMinPerKm })
    .from(schema.runnerProfiles)
    .where(eq(schema.runnerProfiles.userId, userId))
    .limit(1);
  return row?.pace ?? null;
}

export async function saveSelfReportedPace(userId: string, paceMinPerKm: number): Promise<void> {
  await db
    .insert(schema.runnerProfiles)
    .values({ userId, selfReportedPaceMinPerKm: paceMinPerKm, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.runnerProfiles.userId,
      set: { selfReportedPaceMinPerKm: paceMinPerKm, updatedAt: new Date() },
    });
}
