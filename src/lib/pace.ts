import type { Route } from "../../route-library/types/route";
import type { StravaActivity } from "./strava";

// V1 stub: linear pace × distance + flat per-meter gain penalty.
// Real pace-on-grade model lands in Milestone 4 (Python notebook → per-user JSON).
const GAIN_PENALTY_SECONDS_PER_METER = 9; // ~9s per meter of vert, common rule of thumb

export function avgPaceFromRuns(runs: StravaActivity[]): number | null {
  const usable = runs.filter((r) => r.distance > 1000 && r.moving_time > 0);
  if (usable.length === 0) return null;
  const totalMeters = usable.reduce((s, r) => s + r.distance, 0);
  const totalSeconds = usable.reduce((s, r) => s + r.moving_time, 0);
  if (totalMeters === 0) return null;
  return totalSeconds / (totalMeters / 1000) / 60; // min/km
}

export function estimateMovingTimeMinutes(route: Route, avgPaceMinPerKm: number | null): number | null {
  if (avgPaceMinPerKm == null) return null;
  const baseMinutes = route.properties.distance_km * avgPaceMinPerKm;
  const gainPenaltyMinutes = (route.properties.gain_m * GAIN_PENALTY_SECONDS_PER_METER) / 60;
  return Math.round(baseMinutes + gainPenaltyMinutes);
}
