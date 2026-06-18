/**
 * Vert route scaffold (helper for building the curated library efficiently).
 *
 * Turns a folder of GPX files (drawn in a route builder or recorded on a watch)
 * into draft route .geojson files with everything *derivable* already filled in,
 * so the human only has to add the local-knowledge fields.
 *
 * For every *.gpx in ./gpx it:
 *   1. Parses the track and converts it to a GeoJSON LineString.
 *   2. Thins very close-together points (smooths GPS noise, cuts elevation lookups).
 *   3. Backfills elevation from the Mapbox Tilequery API IF the track has none
 *      (needs MAPBOX_TOKEN in the environment). Recorded/built tracks usually
 *      already include elevation, so this is just a fallback.
 *   4. Derives distance_km, gain_m, shape, trailhead lat/lon, a region guess,
 *      and a first-pass difficulty.
 *   5. Writes ./routes/<id>.geojson with the manual fields stubbed so you can
 *      see exactly what's left to do.
 *
 * What's left for you (per route): name, vibe_tags, confirm difficulty,
 * surface %, parking, and founder_notes. Run `npm run ingest` to check your work.
 *
 * Run it:   npm run scaffold
 * Safe to re-run: it never overwrites a route file that already exists.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { gpx as gpxToGeoJSON } from "@tmcw/togeojson";

const here = dirname(fileURLToPath(import.meta.url));
const GPX_DIR = join(here, "gpx");
const ROUTES_DIR = join(here, "routes");

// Load a local .env file (if present) so MAPBOX_TOKEN can live in a gitignored
// file instead of being pasted on the command line each run. Silently does
// nothing if there's no .env or the Node version is too old to support it.
try { (process as any).loadEnvFile?.(join(here, ".env")); } catch { /* no .env — fine */ }

const MIN_POINT_SPACING_M = 15; // drop points closer than this to the last kept point
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN ?? "";

// ---- small geo helpers (same math as ingest.ts) -----------------------

function haversineMeters(a: number[], b: number[]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const round = (n: number, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp;

// ---- region guess (rough centroids; always flagged for review) ---------

// Must match the region enum in schema/route.schema.json, or scaffolded drafts
// will fail ingest on `region`. These centroids are rough and the areas sit close
// together, so treat the guess as a hint to confirm, not gospel.
const REGION_CENTROIDS: { region: string; lat: number; lon: number }[] = [
  { region: "Headlands", lat: 37.826, lon: -122.499 },
  // Tennessee Valley sits within the Headlands — anchor it there so TV-area tracks guess "Headlands".
  { region: "Headlands", lat: 37.8595, lon: -122.5365 },
  { region: "Mill Valley", lat: 37.906, lon: -122.545 },
  { region: "Muir Beach", lat: 37.8616, lon: -122.5778 },
  { region: "Stinson Beach", lat: 37.9005, lon: -122.6436 },
];
function guessRegion(lon: number, lat: number): string {
  let best = "Other";
  let bestM = Infinity;
  for (const c of REGION_CENTROIDS) {
    const d = haversineMeters([lon, lat], [c.lon, c.lat]);
    if (d < bestM) { bestM = d; best = c.region; }
  }
  return bestM < 15000 ? best : "Other";
}

function suggestDifficulty(km: number, gain: number): string {
  if (km <= 8 && gain <= 250) return "easy";
  if (km <= 16 && gain <= 700) return "moderate";
  if (km <= 26 && gain <= 1300) return "hard";
  return "very-hard";
}

// ---- Mapbox elevation backfill -----------------------------------------

async function mapboxElevation(lon: number, lat: number, token: string): Promise<number | null> {
  const url = `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${lon},${lat}.json?layers=contour&limit=50&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox Tilequery HTTP ${res.status}`);
  const json: any = await res.json();
  const eles = (json.features ?? [])
    .map((f: any) => f?.properties?.ele)
    .filter((n: any) => typeof n === "number");
  return eles.length ? Math.max(...eles) : null;
}

// ---- GPX -> normalized coordinate list ---------------------------------

type Pt = [number, number, number | null]; // [lon, lat, ele|null]

function readTrack(xml: string): Pt[] {
  const dom = new DOMParser().parseFromString(xml, "text/xml");
  const fc: any = gpxToGeoJSON(dom as any);
  // find the first track/route feature
  const feat = (fc.features ?? []).find((f: any) =>
    f?.geometry && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString")
  );
  if (!feat) return [];
  let coords: number[][];
  if (feat.geometry.type === "MultiLineString") {
    coords = ([] as number[][]).concat(...feat.geometry.coordinates); // flatten segments
  } else {
    coords = feat.geometry.coordinates;
  }
  return coords.map((c) => [c[0], c[1], typeof c[2] === "number" ? c[2] : null] as Pt);
}

// keep first + last; drop points closer than MIN_POINT_SPACING_M to the last kept
function thin(points: Pt[]): Pt[] {
  if (points.length <= 2) return points;
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (haversineMeters(out[out.length - 1] as number[], points[i] as number[]) >= MIN_POINT_SPACING_M) {
      out.push(points[i]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function slugify(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Turn a kebab-case id into a Title Case name, e.g. "matt-davis-loop" -> "Matt Davis Loop".
const SMALL_WORDS = new Set(["to", "and", "the", "of", "at", "on", "in", "by", "a", "an", "or", "for", "with"]);
function titleFromId(id: string): string {
  return id.split("-")
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---- main --------------------------------------------------------------

async function main() {
  if (!existsSync(GPX_DIR)) mkdirSync(GPX_DIR, { recursive: true });
  if (!existsSync(ROUTES_DIR)) mkdirSync(ROUTES_DIR, { recursive: true });

  const files = readdirSync(GPX_DIR).filter((f) => f.toLowerCase().endsWith(".gpx"));
  if (!files.length) {
    console.log(`\nNo .gpx files in ./gpx — drop your exported GPX files there and re-run.\n`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  console.log(`\nScaffolding ${files.length} GPX file(s)\n`);

  for (const file of files) {
    const id = slugify(basename(file, ".gpx"));
    const target = join(ROUTES_DIR, `${id}.geojson`);
    if (existsSync(target)) {
      console.log(`  • ${file}: routes/${id}.geojson already exists — skipped (won't overwrite)`);
      continue;
    }

    let pts = readTrack(readFileSync(join(GPX_DIR, file), "utf8"));
    if (pts.length < 2) {
      console.log(`  ✗ ${file}: couldn't find a usable track in this GPX`);
      continue;
    }
    pts = thin(pts);

    // elevation backfill if the track has little/no elevation
    const haveEle = pts.filter((p) => typeof p[2] === "number").length;
    let eleNote = "from GPX";
    if (haveEle / pts.length < 0.5) {
      if (MAPBOX_TOKEN) {
        process.stdout.write(`  … ${file}: backfilling elevation from Mapbox (${pts.length} pts) `);
        try {
          for (const p of pts) { p[2] = await mapboxElevation(p[0], p[1], MAPBOX_TOKEN); }
          eleNote = "from Mapbox";
          process.stdout.write("done\n");
        } catch (e) {
          eleNote = "FAILED — left at 0; check token/network and re-run";
          process.stdout.write(`failed (${(e as Error).message})\n`);
        }
      } else {
        eleNote = "MISSING — set MAPBOX_TOKEN and re-run, or use a track with elevation";
      }
    }

    const coords = pts.map((p) => [p[0], p[1], typeof p[2] === "number" ? round(p[2], 1) : 0]);

    // derive
    let distM = 0;
    for (let i = 1; i < coords.length; i++) distM += haversineMeters(coords[i - 1], coords[i]);
    let gain = 0;
    for (let i = 1; i < coords.length; i++) {
      const d = coords[i][2] - coords[i - 1][2];
      if (d > 0) gain += d;
    }
    const distance_km = round(distM / 1000, 1);
    const gain_m = round(gain);
    const start = coords[0];
    const end = coords[coords.length - 1];
    const closes = haversineMeters(start, end) < 75;
    const shape = closes ? "loop" : "point-to-point"; // NOTE: out-and-back also closes — confirm

    // properties first so the human-editable fields sit at the top of the file,
    // not below hundreds of coordinate lines.
    const draft = {
      type: "Feature",
      properties: {
        id,
        name: titleFromId(id),
        status: "draft",
        region: guessRegion(start[0], start[1]),
        shape,
        distance_km,
        gain_m,
        difficulty: suggestDifficulty(distance_km, gain_m),
        surface: { trail_pct: 0, fire_road_pct: 0, road_pct: 0 },
        vibe_tags: [],
        trailhead: {
          name: "TODO — trailhead name",
          lat: round(start[1], 5),
          lon: round(start[0], 5),
          parking: "limited",
        },
        last_verified: today,
        founder_notes: "TODO — your local-knowledge note",
      },
      geometry: { type: "LineString", coordinates: coords },
    };

    // collapse each [lon, lat, ele] triple onto one line for a readable file
    const json = JSON.stringify(draft, null, 2).replace(
      /\[\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*\]/g,
      "[$1, $2, $3]"
    );
    writeFileSync(target, json + "\n");
    console.log(
      `  ✓ ${file} → routes/${id}.geojson  (${distance_km} km / ${gain_m} m / ${draft.properties.shape}, region guess: ${draft.properties.region}, elevation: ${eleNote})`
    );
    console.log(`      to finish: name · vibe_tags · confirm difficulty (${draft.properties.difficulty}) · surface % · parking · confirm shape · founder_notes`);
  }

  console.log(`\nDone. Edit the drafts in ./routes, then run \`npm run ingest\` to validate.`);
  console.log(`(Each draft will fail ingest until you add at least one vibe_tag and real surface % — that's intentional.)\n`);
}

main();
