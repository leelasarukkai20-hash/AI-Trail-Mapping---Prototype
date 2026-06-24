import type { Route } from "../../route-library/types/route";
import type { Intent, SurfacePreference } from "./intent";

export interface ScoreBreakdown {
  distance: number;
  gain: number;
  surface: number;
  vibe: number;
  difficulty: number;
}

export interface ScoredRoute {
  route: Route;
  score: number;
  breakdown: ScoreBreakdown;
  rationale: string;
}

const DIFFICULTY_RANK = { "easy": 0, "moderate": 1, "hard": 2, "very-hard": 3 } as const;

function gaussian(x: number, target: number, sigma: number): number {
  const d = x - target;
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

function distanceScore(route: Route, intent: Intent): number {
  if (intent.distance_km == null) return 0;
  const sigma = intent.distance_tolerance_km ?? 3;
  return gaussian(route.properties.distance_km, intent.distance_km, sigma);
}

function gainScore(route: Route, intent: Intent): number {
  const gain = route.properties.gain_m;
  const min = intent.min_gain_m;
  const max = intent.max_gain_m;
  if (min == null && max == null) return 0;
  if (min != null && max != null) {
    if (gain >= min && gain <= max) return 1;
    const out = gain < min ? min - gain : gain - max;
    return Math.max(0, 1 - out / 300);
  }
  if (min != null) {
    if (gain >= min) return Math.min(1, 0.5 + (gain - min) / 600);
    return Math.max(0, 1 - (min - gain) / 300);
  }
  if (gain <= max!) return Math.min(1, 0.5 + (max! - gain) / 600);
  return Math.max(0, 1 - (gain - max!) / 300);
}

function surfaceFraction(route: Route, pref: SurfacePreference): number {
  const s = route.properties.surface;
  switch (pref) {
    case "trail": return s.trail_pct / 100;
    case "fire_road": return s.fire_road_pct / 100;
    case "road": return s.road_pct / 100;
    case "any": return 1;
  }
}

function surfaceScore(route: Route, intent: Intent): number {
  if (!intent.surface_preference || intent.surface_preference === "any") return 0;
  return surfaceFraction(route, intent.surface_preference);
}

function vibeScore(route: Route, intent: Intent): number {
  if (!intent.vibe_tags || intent.vibe_tags.length === 0) return 0;
  const routeTags = new Set(route.properties.vibe_tags);
  const hits = intent.vibe_tags.filter((t) => routeTags.has(t)).length;
  return hits / intent.vibe_tags.length;
}

function difficultyScore(route: Route, intent: Intent): number {
  if (!intent.difficulty) return 0;
  const diff = Math.abs(DIFFICULTY_RANK[route.properties.difficulty] - DIFFICULTY_RANK[intent.difficulty]);
  return Math.max(0, 1 - diff / 3);
}

const WEIGHTS = { distance: 0.30, gain: 0.25, surface: 0.15, vibe: 0.20, difficulty: 0.10 };

function buildRationale(route: Route, intent: Intent, b: ScoreBreakdown): string {
  const parts: string[] = [];
  if (b.distance > 0.7 && intent.distance_km != null) {
    parts.push(`${route.properties.distance_km} km matches your ~${Math.round(intent.distance_km)} km target`);
  }
  if (b.gain > 0.7) {
    parts.push(`${route.properties.gain_m} m of climbing`);
  }
  if (b.surface > 0.5 && intent.surface_preference && intent.surface_preference !== "any") {
    const pct = Math.round(surfaceFraction(route, intent.surface_preference) * 100);
    const label = intent.surface_preference === "fire_road" ? "fire road" : intent.surface_preference;
    parts.push(`${pct}% ${label}`);
  }
  if (b.vibe > 0 && intent.vibe_tags) {
    const hits = intent.vibe_tags.filter((t) => route.properties.vibe_tags.includes(t));
    if (hits.length > 0) parts.push(hits.join(", "));
  }
  if (b.difficulty > 0.9 && intent.difficulty) {
    parts.push(`${route.properties.difficulty} difficulty`);
  }
  if (parts.length === 0) {
    parts.push(`${route.properties.distance_km} km · ${route.properties.gain_m} m · ${route.properties.region}`);
  }
  return parts.join(" · ");
}

export function rankRoutes(routes: Route[], intent: Intent): ScoredRoute[] {
  // TODO: re-enable status === "active" filter once curation in /curate has promoted routes.
  // Today all 52 routes are status: "draft", so filtering them out leaves nothing to recommend.
  const filtered = routes.filter((r) => {
    if (intent.region && r.properties.region !== intent.region) return false;
    if (intent.dogs_allowed === true && r.properties.dogs_allowed !== true) return false;
    return true;
  });

  const scored = filtered.map((route): ScoredRoute => {
    const breakdown: ScoreBreakdown = {
      distance: distanceScore(route, intent),
      gain: gainScore(route, intent),
      surface: surfaceScore(route, intent),
      vibe: vibeScore(route, intent),
      difficulty: difficultyScore(route, intent),
    };
    const score =
      breakdown.distance * WEIGHTS.distance +
      breakdown.gain * WEIGHTS.gain +
      breakdown.surface * WEIGHTS.surface +
      breakdown.vibe * WEIGHTS.vibe +
      breakdown.difficulty * WEIGHTS.difficulty;
    return { route, score, breakdown, rationale: buildRationale(route, intent, breakdown) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
