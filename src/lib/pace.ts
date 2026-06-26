import type { Route } from "../../route-library/types/route";
import type { StravaActivity } from "./strava";
import paceCurveData from "../../pace-model/leela.json";

// Grade-aware pace estimation.
//
// Per the V0 design: one global pace-on-grade curve (Leela's, or the
// placeholder until her streams have been fit), scaled by each user's own
// flat-ground baseline pace from their 90-day Strava history.
//
// The curve lives in pace-model/leela.json. See pace-model/README.md for how
// to regenerate it. The shape is { grade_pct: pace_multiplier_vs_baseline }.

interface PaceCurve {
  baseline_pace_min_per_km: number;
  grade_curve: Record<string, number>;
  bin_size_pct: number;
}

const PACE_CURVE = paceCurveData as PaceCurve;

// Sort bin edges once at module load so lookup is O(log n) per segment.
const SORTED_BINS: { grade: number; multiplier: number }[] = Object.entries(PACE_CURVE.grade_curve)
  .map(([g, m]) => ({ grade: Number(g), multiplier: m as number }))
  .sort((a, b) => a.grade - b.grade);

const MIN_BIN = SORTED_BINS[0];
const MAX_BIN = SORTED_BINS[SORTED_BINS.length - 1];

export function avgPaceFromRuns(runs: StravaActivity[]): number | null {
  const usable = runs.filter((r) => r.distance > 1000 && r.moving_time > 0);
  if (usable.length === 0) return null;
  const totalMeters = usable.reduce((s, r) => s + r.distance, 0);
  const totalSeconds = usable.reduce((s, r) => s + r.moving_time, 0);
  if (totalMeters === 0) return null;
  return totalSeconds / (totalMeters / 1000) / 60;
}

/** Linear interp between the two surrounding bins; clamp at curve extremes. */
function paceMultiplier(gradePct: number): number {
  if (gradePct <= MIN_BIN.grade) return MIN_BIN.multiplier;
  if (gradePct >= MAX_BIN.grade) return MAX_BIN.multiplier;
  for (let i = 1; i < SORTED_BINS.length; i++) {
    const lo = SORTED_BINS[i - 1];
    const hi = SORTED_BINS[i];
    if (gradePct <= hi.grade) {
      const t = (gradePct - lo.grade) / (hi.grade - lo.grade);
      return lo.multiplier * (1 - t) + hi.multiplier * t;
    }
  }
  return 1.0;
}

/** Haversine distance between two GeoJSON positions in meters. */
function haversineMeters(a: [number, number, number], b: [number, number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Estimated moving time in minutes, grade-aware.
 *
 * Walks the route geometry segment-by-segment, computes grade per segment,
 * looks up the pace multiplier from the global curve, scales by the user's
 * baseline pace, and sums. Falls back to a flat per-meter penalty if the
 * route doesn't have geometry (shouldn't happen in practice — all curated
 * routes are LineStrings).
 */
export function estimateMovingTimeMinutes(route: Route, avgPaceMinPerKm: number | null): number | null {
  if (avgPaceMinPerKm == null) return null;
  const coords = route.geometry.coordinates;
  if (!coords || coords.length < 2) {
    // Defensive fallback — every curated route has geometry, but in case
    // something thin gets here, use the old simple estimate.
    return Math.round(route.properties.distance_km * avgPaceMinPerKm + (route.properties.gain_m * 9) / 60);
  }

  let totalMinutes = 0;
  for (let i = 1; i < coords.length; i++) {
    const dMeters = haversineMeters(coords[i - 1] as [number, number, number], coords[i] as [number, number, number]);
    if (dMeters < 1) continue; // skip dupes / GPS jitter
    const dElev = coords[i][2] - coords[i - 1][2];
    const gradePct = (dElev / dMeters) * 100;
    const mult = paceMultiplier(gradePct);
    totalMinutes += (dMeters / 1000) * avgPaceMinPerKm * mult;
  }
  return Math.round(totalMinutes);
}
