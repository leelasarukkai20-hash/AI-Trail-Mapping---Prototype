/**
 * Write the spreadsheet values back into the route .geojson files.
 *
 *   npm run apply   ->  reads routes-metadata.xlsx, updates routes/<id>.geojson
 *
 * For each row it finds the matching routes/<id>.geojson (the geometry stays
 * exactly as-is — the sheet never touches it), rebuilds the properties from your
 * edited values, and recomputes distance_km, gain_m, and trailhead lat/lon
 * straight from the geometry so those are always correct.
 *
 * It does NOT validate — run `npm run ingest` afterwards to catch anything
 * missing (a blank vibe_tag, surface that doesn't sum to ~100, etc.).
 * Safe to run repeatedly as you fill more rows.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ExcelJS from "exceljs";

const here = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = join(here, "routes");
const XLSX = join(here, "routes-metadata.xlsx");

if (!existsSync(XLSX)) {
  console.log("\nNo routes-metadata.xlsx found. Run `npm run export` first, fill it in, then re-run.\n");
  process.exit(0);
}

// --- geometry helpers (same math as ingest.ts) ---
function haversineMeters(a: number[], b: number[]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const round = (n: number, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp;

function cellStr(cell: ExcelJS.Cell | undefined): string {
  const v = cell?.value as any;
  if (v == null) return "";
  if (typeof v === "object") {
    if ("text" in v) return String(v.text);
    if ("result" in v) return String(v.result);
    if ("richText" in v) return v.richText.map((t: any) => t.text).join("");
    return String(v);
  }
  return String(v);
}
const intOr0 = (s: string) => { const n = parseInt(s, 10); return Number.isFinite(n) ? n : 0; };
function boolOrUndef(s: string): boolean | undefined {
  const t = s.trim().toLowerCase();
  if (t === "true") return true;
  if (t === "false") return false;
  return undefined;
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);
const ws = wb.getWorksheet("Routes") ?? wb.worksheets[0];

// map header -> column index
const colOf: Record<string, number> = {};
ws.getRow(1).eachCell((cell, col) => { colOf[String(cell.value).trim()] = col; });
const get = (row: ExcelJS.Row, key: string) => (colOf[key] ? cellStr(row.getCell(colOf[key])) : "");

let applied = 0, skipped = 0;
const today = new Date().toISOString().slice(0, 10);

ws.eachRow((row, rn) => {
  if (rn === 1) return;
  const id = get(row, "id").trim();
  if (!id) return;
  const path = join(ROUTES_DIR, `${id}.geojson`);
  if (!existsSync(path)) {
    console.log(`  • skipped '${id}': no matching routes/${id}.geojson`);
    skipped++;
    return;
  }
  const gj = JSON.parse(readFileSync(path, "utf8"));
  const coords: number[][] = gj.geometry?.coordinates ?? [];
  // recompute derived fields from geometry (authoritative)
  let distM = 0, gain = 0;
  for (let i = 1; i < coords.length; i++) {
    distM += haversineMeters(coords[i - 1], coords[i]);
    const d = coords[i][2] - coords[i - 1][2];
    if (d > 0) gain += d;
  }
  const start = coords[0] ?? [0, 0, 0];

  const props: Record<string, any> = {
    id,
    name: get(row, "name").trim(),
    status: get(row, "status").trim() || "draft",
    region: get(row, "region").trim(),
    shape: get(row, "shape").trim(),
    distance_km: round(distM / 1000, 1),
    gain_m: round(gain),
    difficulty: get(row, "difficulty").trim(),
    surface: {
      trail_pct: intOr0(get(row, "trail_pct")),
      fire_road_pct: intOr0(get(row, "fire_road_pct")),
      road_pct: intOr0(get(row, "road_pct")),
    },
    vibe_tags: get(row, "vibe_tags").split(",").map((t) => t.trim()).filter(Boolean),
    trailhead: {
      name: get(row, "trailhead_name").trim(),
      lat: round(start[1], 5),
      lon: round(start[0], 5),
      parking: get(row, "parking").trim(),
      ...(get(row, "trailhead_notes").trim() ? { notes: get(row, "trailhead_notes").trim() } : {}),
    },
  };
  const dogs = boolOrUndef(get(row, "dogs_allowed"));
  if (dogs !== undefined) props.dogs_allowed = dogs;
  const water = boolOrUndef(get(row, "water_on_route"));
  if (water !== undefined) props.water_on_route = water;
  const lv = get(row, "last_verified").trim();
  props.last_verified = lv || today;
  props.founder_notes = get(row, "founder_notes").trim();

  const out = { type: "Feature", properties: props, geometry: gj.geometry };
  const json = JSON.stringify(out, null, 2).replace(
    /\[\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*\]/g,
    "[$1, $2, $3]"
  );
  writeFileSync(path, json + "\n");
  applied++;
});

console.log(`\nApplied ${applied} route(s)${skipped ? `, skipped ${skipped}` : ""}.`);
console.log(`Now run:  npm run ingest\n`);
