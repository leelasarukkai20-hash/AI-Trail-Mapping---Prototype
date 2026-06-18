/**
 * Vert route ingest + validate workflow (task R2).
 *
 * What it does, for every *.geojson file in ./routes:
 *   1. Parses the JSON.
 *   2. Validates it against schema/route.schema.json (structure + controlled vocab).
 *   3. Derives distance and elevation gain straight from the geometry.
 *   4. Cross-checks the derived numbers against the distance_km / gain_m you typed,
 *      and warns if they disagree (catches a bad GPX track or a typo).
 *   5. Checks the surface percentages add up to ~100.
 *   6. Loads all valid routes into one in-memory array and prints a summary.
 *
 * Run it:   npx tsx ingest.ts
 * It exits with code 1 if any route is invalid, so it can gate a build later.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import type { Route } from "./types/route";

const here = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = join(here, "routes");
const SCHEMA_PATH = join(here, "schema", "route.schema.json");

// Tolerances for the geometry cross-check. Gain is noisier than distance, so it's looser.
const DISTANCE_TOLERANCE = 0.08; // 8%
const GAIN_TOLERANCE = 0.2; // 20%

// ---- geometry helpers --------------------------------------------------

// Great-circle distance between two [lon, lat, ...] points, in meters.
function haversineMeters(a: number[], b: number[]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function deriveDistanceKm(coords: number[][]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += haversineMeters(coords[i - 1], coords[i]);
  return m / 1000;
}

// Total positive elevation change (sum of every uphill step), in meters.
function deriveGainM(coords: number[][]): number {
  let gain = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = coords[i][2] - coords[i - 1][2];
    if (d > 0) gain += d;
  }
  return gain;
}

const pctDiff = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : 1) : Math.abs(a - b) / b);

// ---- load schema + validator ------------------------------------------

const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(schema);

// ---- run ---------------------------------------------------------------

const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".geojson"));
const loaded: Route[] = [];
const ids = new Set<string>();
let hadError = false;

console.log(`\nScanning ${files.length} route file(s) in ./routes\n`);

for (const file of files) {
  const problems: string[] = [];
  const warnings: string[] = [];
  let route: Route | undefined;

  try {
    route = JSON.parse(readFileSync(join(ROUTES_DIR, file), "utf8")) as Route;
  } catch (e) {
    console.log(`  ✗ ${file}: not valid JSON - ${(e as Error).message}`);
    hadError = true;
    continue;
  }

  // 1. schema validation
  if (!validate(route)) {
    for (const err of validate.errors ?? []) {
      problems.push(`${err.instancePath || "(root)"} ${err.message}`);
    }
  }

  // 2. cross-checks (only meaningful if the shape validated enough to read these)
  const props = route.properties;
  const coords = route.geometry?.coordinates;

  if (props && Array.isArray(coords) && coords.length >= 2) {
    if (ids.has(props.id)) problems.push(`duplicate id '${props.id}'`);

    const derivedDist = deriveDistanceKm(coords);
    const derivedGain = deriveGainM(coords);

    if (pctDiff(derivedDist, props.distance_km) > DISTANCE_TOLERANCE) {
      warnings.push(
        `distance_km says ${props.distance_km} but geometry implies ${derivedDist.toFixed(2)} km`
      );
    }
    if (pctDiff(derivedGain, props.gain_m) > GAIN_TOLERANCE) {
      warnings.push(
        `gain_m says ${props.gain_m} but geometry implies ${Math.round(derivedGain)} m`
      );
    }

    const s = props.surface;
    if (s) {
      const sum = s.trail_pct + s.fire_road_pct + s.road_pct;
      if (Math.abs(sum - 100) > 1) warnings.push(`surface percentages sum to ${sum}, not ~100`);
    }
  }

  // 3. report
  if (problems.length) {
    hadError = true;
    console.log(`  ✗ ${file}`);
    for (const p of problems) console.log(`      error:   ${p}`);
    for (const w of warnings) console.log(`      warning: ${w}`);
  } else {
    loaded.push(route);
    ids.add(props.id);
    const flag = warnings.length ? "⚠" : "✓";
    console.log(`  ${flag} ${file}  -  ${props.name} (${props.distance_km} km / ${props.gain_m} m / ${props.difficulty})`);
    for (const w of warnings) console.log(`      warning: ${w}`);
  }
}

// ---- summary -----------------------------------------------------------

console.log(`\n${loaded.length} route(s) loaded, ${files.length - loaded.length} rejected.`);
if (loaded.length) {
  const byRegion: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const r of loaded) {
    byRegion[r.properties.region] = (byRegion[r.properties.region] ?? 0) + 1;
    byDifficulty[r.properties.difficulty] = (byDifficulty[r.properties.difficulty] ?? 0) + 1;
    byStatus[r.properties.status] = (byStatus[r.properties.status] ?? 0) + 1;
  }
  console.log("  by status:    ", byStatus);
  console.log("  by region:    ", byRegion);
  console.log("  by difficulty:", byDifficulty);
}
console.log("");

// `loaded` is the in-memory route library other code would import.
// When you wire this into the app, export it instead of just printing.
export default loaded;

if (hadError) process.exit(1);
