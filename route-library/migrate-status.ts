/**
 * One-time backfill: stamp status:"draft" on any route file that doesn't have one.
 *
 *   npm run migrate-status
 *
 * Safe to run repeatedly. It only touches files that are missing `status`, and it
 * only inserts that single field (right after `name`) — everything else, including
 * the geometry, is preserved byte-for-byte in value. After this, `status` is a
 * required field, so run `npm run ingest` to confirm everything still validates.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = join(here, "routes");

const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".geojson"));
let changed = 0;

for (const f of files) {
  const path = join(ROUTES_DIR, f);
  const gj = JSON.parse(readFileSync(path, "utf8"));
  const p = gj.properties ?? {};
  if (p.status) continue;

  // Insert `status` right after `name`, preserving every other field and its order.
  if ("id" in p && "name" in p) {
    const { id, name, ...rest } = p;
    gj.properties = { id, name, status: "draft", ...rest };
  } else {
    p.status = "draft";
    gj.properties = p;
  }

  const json = JSON.stringify(gj, null, 2).replace(
    /\[\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*\]/g,
    "[$1, $2, $3]"
  );
  writeFileSync(path, json + "\n");
  changed++;
}

console.log(`\nStamped status:"draft" on ${changed} route(s) that were missing it (${files.length} file(s) total).`);
console.log(`Now run:  npm run ingest\n`);
