/**
 * Export every route draft into ONE spreadsheet for easy bulk editing.
 *
 *   npm run export   ->  writes routes-metadata.xlsx
 *
 * Each route is a row. The columns that come from the GPX (id, distance, gain,
 * trailhead lat/lon) are greyed out — don't edit those. The fields you fill in
 * (name, region, shape, difficulty, surface %, vibe_tags, parking, notes,
 * founder_notes) have dropdowns where there's a fixed list, pulled straight from
 * route.schema.json so they can never drift out of sync.
 *
 * Fill it in (you and Leela can split rows), then run `npm run apply` to write
 * the values back into the .geojson files, then `npm run ingest` to validate.
 *
 * Re-running export rebuilds the sheet from the current .geojson files, so it
 * always reflects what's already saved (handy to see remaining blanks).
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ExcelJS from "exceljs";

const here = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = join(here, "routes");
const OUT = join(here, "routes-metadata.xlsx");

// Pull the controlled vocabularies from the schema so the dropdowns always match.
const SCHEMA = JSON.parse(readFileSync(join(here, "schema", "route.schema.json"), "utf8"));
const P = SCHEMA.properties.properties.properties;
const STATUS: string[] = P.status.enum;
const REGIONS: string[] = P.region.enum;
const SHAPES: string[] = P.shape.enum;
const DIFFS: string[] = P.difficulty.enum;
const PARKING: string[] = P.trailhead.properties.parking.enum;
const VIBES: string[] = P.vibe_tags.items.enum;

type Col = { key: string; width: number; derived?: boolean; list?: string[]; wrap?: boolean; note?: string };
const COLS: Col[] = [
  { key: "id", width: 28, derived: true, note: "From the GPX filename. Don't edit." },
  { key: "name", width: 32 },
  { key: "status", width: 10, list: STATUS, note: "draft = work in progress (hidden); active = vetted and OK to recommend." },
  { key: "region", width: 15, list: REGIONS },
  { key: "shape", width: 15, list: SHAPES, note: "Auto-guessed; confirm (out-and-back also returns to start)." },
  { key: "difficulty", width: 12, list: DIFFS, note: "Auto-guessed from distance + gain; confirm." },
  { key: "distance_km", width: 11, derived: true, note: "From the GPX. Don't edit." },
  { key: "gain_m", width: 9, derived: true, note: "From the GPX. Don't edit." },
  { key: "trail_pct", width: 9, note: "Singletrack %. trail + fire_road + road should sum to ~100." },
  { key: "fire_road_pct", width: 12 },
  { key: "road_pct", width: 9 },
  { key: "vibe_tags", width: 40, wrap: true, note: "Comma-separated. Use ONLY values from the Guide tab, e.g. ocean-views, exposed, steep-climb." },
  { key: "trailhead_name", width: 24 },
  { key: "parking", width: 11, list: PARKING },
  { key: "trailhead_notes", width: 28, wrap: true },
  { key: "dogs_allowed", width: 12, list: ["true", "false"] },
  { key: "water_on_route", width: 13, list: ["true", "false"] },
  { key: "last_verified", width: 12, note: "YYYY-MM-DD." },
  { key: "trailhead_lat", width: 12, derived: true, note: "From the GPX. Don't edit." },
  { key: "trailhead_lon", width: 12, derived: true, note: "From the GPX. Don't edit." },
  { key: "founder_notes", width: 60, wrap: true },
];

const stripTodo = (v: any) => (typeof v === "string" && /^todo/i.test(v.trim()) ? "" : v ?? "");

// Turn a kebab-case id into a Title Case name, e.g. "matt-davis-loop" -> "Matt Davis Loop".
const SMALL_WORDS = new Set(["to", "and", "the", "of", "at", "on", "in", "by", "a", "an", "or", "for", "with"]);
const titleFromId = (id: string) =>
  id.split("-").map((w, i) => (i > 0 && SMALL_WORDS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".geojson")).sort();
const rows = files.map((f) => {
  const r = JSON.parse(readFileSync(join(ROUTES_DIR, f), "utf8"));
  const p = r.properties ?? {};
  const s = p.surface ?? {};
  const th = p.trailhead ?? {};
  const c0 = r.geometry?.coordinates?.[0] ?? [];
  const blankZeroSurface = (s.trail_pct ?? 0) === 0 && (s.fire_road_pct ?? 0) === 0 && (s.road_pct ?? 0) === 0;
  return {
    id: p.id ?? f.replace(/\.geojson$/, ""),
    name: stripTodo(p.name) || titleFromId(p.id ?? f.replace(/\.geojson$/, "")),
    status: p.status ?? "draft",
    region: p.region ?? "",
    shape: p.shape ?? "",
    difficulty: p.difficulty ?? "",
    distance_km: p.distance_km ?? "",
    gain_m: p.gain_m ?? "",
    trail_pct: blankZeroSurface ? "" : s.trail_pct,
    fire_road_pct: blankZeroSurface ? "" : s.fire_road_pct,
    road_pct: blankZeroSurface ? "" : s.road_pct,
    vibe_tags: (p.vibe_tags ?? []).join(", "),
    trailhead_name: stripTodo(th.name),
    parking: th.parking ?? "",
    trailhead_notes: th.notes ?? "",
    dogs_allowed: typeof p.dogs_allowed === "boolean" ? String(p.dogs_allowed) : "",
    water_on_route: typeof p.water_on_route === "boolean" ? String(p.water_on_route) : "",
    last_verified: p.last_verified ?? "",
    trailhead_lat: th.lat ?? c0[1] ?? "",
    trailhead_lon: th.lon ?? c0[0] ?? "",
    founder_notes: stripTodo(p.founder_notes),
  } as Record<string, any>;
});

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Routes", { views: [{ state: "frozen", ySplit: 1 }] });
ws.columns = COLS.map((c) => ({ header: c.key, key: c.key, width: c.width }));

// header styling
COLS.forEach((c, i) => {
  const cell = ws.getCell(1, i + 1);
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E3D" } };
  cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  if (c.note) cell.note = c.note;
});

rows.forEach((r) => ws.addRow(r));

// per-cell styling + dropdown validation
COLS.forEach((c, i) => {
  const col = i + 1;
  for (let rr = 2; rr <= rows.length + 1; rr++) {
    const cell = ws.getCell(rr, col);
    cell.alignment = { vertical: "top", wrapText: !!c.wrap };
    if (c.derived) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
    if (c.list) cell.dataValidation = { type: "list", allowBlank: true, formulae: [`"${c.list.join(",")}"`] };
  }
});
ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS.length } };

// Guide tab
const g = wb.addWorksheet("Guide");
g.getColumn(1).width = 22;
g.getColumn(2).width = 100;
const guide: [string, string][] = [
  ["How to use this sheet", ""],
  ["1", "Fill in the blank columns on the Routes tab. Grey columns come from the GPX — leave them alone."],
  ["2", "Columns with a fixed list (region, shape, difficulty, parking) have a dropdown. dogs_allowed / water_on_route: true, false, or blank."],
  ["3", "vibe_tags: type a comma-separated list using ONLY the values below. These are the matching signal, so keep them consistent."],
  ["4", "surface: trail_pct + fire_road_pct + road_pct should add up to about 100."],
  ["5", "You and Leela can edit different rows. Save the file when done (or partway)."],
  ["6", "Then run:  npm run apply   (writes your values into the .geojson files), then  npm run ingest  (checks them)."],
  ["", ""],
  ["Allowed values", ""],
  ["status", STATUS.join(", ")],
  ["region", REGIONS.join(", ")],
  ["shape", SHAPES.join(", ")],
  ["difficulty", DIFFS.join(", ")],
  ["parking", PARKING.join(", ")],
  ["vibe_tags", VIBES.join(", ")],
];
guide.forEach(([a, b], idx) => {
  const row = g.addRow([a, b]);
  if (b === "" || a === "How to use this sheet" || a === "Allowed values") {
    row.getCell(1).font = { bold: true };
  }
  row.getCell(2).alignment = { wrapText: true, vertical: "top" };
});
g.views = [{ state: "frozen", ySplit: 1 }];

await wb.xlsx.writeFile(OUT);
console.log(`\nWrote routes-metadata.xlsx with ${rows.length} route row(s).`);
console.log(`Fill in the blanks, then: npm run apply  ->  npm run ingest\n`);
