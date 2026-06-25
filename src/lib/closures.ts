/**
 * Trail closures (task C2).
 *
 * A closure is *operational* state, separate from a route's editorial `status`.
 * The data lives in route-library/closures.json so it can be edited and reviewed
 * weekly without touching code. Each entry lists the route ids it takes out of
 * rotation, a reason, a source link to the official park alert, and a date window.
 *
 * The ranker calls getClosedRouteIds() and never recommends a route that's in a
 * currently-active closure. This guards the project's #1 risk: routing someone
 * onto a closed trail.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface Closure {
  id: string; // stable id for this closure entry
  reason: string;
  route_ids: string[]; // routes taken out of rotation while this is active
  source_url?: string; // official park alert this is based on
  since?: string; // YYYY-MM-DD; absent = always-started
  until?: string | null; // YYYY-MM-DD; null/absent = ongoing/indefinite
  last_checked?: string; // YYYY-MM-DD a human last confirmed this
  note?: string;
}

const CLOSURES_PATH = join(process.cwd(), "route-library", "closures.json");

export function loadClosures(): Closure[] {
  if (!existsSync(CLOSURES_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(CLOSURES_PATH, "utf8"));
    return Array.isArray(data) ? (data as Closure[]) : [];
  } catch {
    return [];
  }
}

function isActive(c: Closure, todayISO: string): boolean {
  if (c.since && c.since > todayISO) return false; // not started yet
  if (c.until && c.until < todayISO) return false; // already ended
  return true;
}

/** Set of route ids that are closed as of `today` (defaults to now). */
export function getClosedRouteIds(today: Date = new Date()): Set<string> {
  const todayISO = today.toISOString().slice(0, 10);
  const ids = new Set<string>();
  for (const c of loadClosures()) {
    if (isActive(c, todayISO)) for (const rid of c.route_ids) ids.add(rid);
  }
  return ids;
}
