/**
 * Pull last-90-days Strava activity streams and write one JSON file per
 * activity to pace-model/streams/. Idempotent: skips activities already on
 * disk, so safe to re-run as often as you like.
 *
 *   npm run fetch-streams
 *
 * Requires STRAVA_PERSONAL_ACCESS_TOKEN in .env (see pace-model/README.md
 * for how to get one).
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getRecentRuns } from "../src/lib/strava";

const STREAMS_API = "https://www.strava.com/api/v3/activities";
const STREAM_KEYS = "time,distance,altitude,grade_smooth";
const OUT_DIR = join(process.cwd(), "pace-model", "streams");
const SLEEP_MS_BETWEEN = 250; // ~4/sec, well under the 200/15min cap

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchStreams(activityId: number, token: string): Promise<unknown> {
  const url = `${STREAMS_API}/${activityId}/streams?keys=${STREAM_KEYS}&key_by_type=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 429) {
    throw new Error("Strava rate limit (429). Wait 15 min and retry.");
  }
  if (res.status === 404) {
    // Some activities don't have streams (e.g. manual entries). Skip.
    return null;
  }
  if (!res.ok) {
    throw new Error(`Streams fetch failed for ${activityId}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function main(): Promise<void> {
  // Match the eval runner's env-loading convention.
  try { (process as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(".env"); } catch { /* optional */ }
  try { (process as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(".env.local"); } catch { /* optional */ }

  const token = process.env.STRAVA_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "STRAVA_PERSONAL_ACCESS_TOKEN not set.\n" +
      "Get one from https://www.strava.com/settings/api ('Your Access Token'),\n" +
      "then add it to .env. See pace-model/README.md."
    );
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const already = new Set(readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")));

  console.log("Fetching last 90 days of runs…");
  const runs = await getRecentRuns(token);
  console.log(`  ${runs.length} runs returned. ${already.size} already on disk.`);

  let pulled = 0;
  let skipped = 0;
  let empty = 0;
  for (const run of runs) {
    const id = String(run.id);
    if (already.has(id)) { skipped++; continue; }
    process.stdout.write(`  ${run.start_date.slice(0, 10)}  ${run.name.padEnd(45).slice(0, 45)}  ${(run.distance / 1000).toFixed(1)}km … `);
    try {
      const data = await fetchStreams(run.id, token);
      if (data == null) {
        console.log("no streams (skip)");
        empty++;
      } else {
        writeFileSync(join(OUT_DIR, `${id}.json`), JSON.stringify(data));
        console.log("saved");
        pulled++;
      }
    } catch (err) {
      console.log(`error: ${(err as Error).message}`);
      throw err;
    }
    await sleep(SLEEP_MS_BETWEEN);
  }

  console.log(`\nDone. Pulled ${pulled} new, skipped ${skipped} already-cached, ${empty} had no streams.`);
  console.log(`Next: python3 pace-model/fit.py`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
