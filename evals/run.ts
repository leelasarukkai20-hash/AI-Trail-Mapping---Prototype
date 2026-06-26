/**
 * Recommendation-engine eval runner.
 *
 *   npm run eval
 *
 * - Ranking cases run always (pure scorer, no API).
 * - Intent-parsing cases run only if ANTHROPIC_API_KEY is set (they call Haiku).
 *
 * Exits non-zero if any case fails, so it can gate CI later. Cases tagged
 * [known gap] are expected to fail until the corresponding fix lands.
 */
import { listRoutes } from "../src/lib/routes";
import { rankRoutes } from "../src/lib/ranker";
import { rankingCases, intentCases } from "./cases";

function line(pass: boolean, id: string, detail: string) {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${id.padEnd(6)}  ${detail}`);
}

async function main() {
  // Load env from .env then .env.local (Next.js convention; .env.local wins),
  // so ANTHROPIC_API_KEY can live wherever you already keep it.
  try { (process as any).loadEnvFile?.(".env"); } catch { /* optional */ }
  try { (process as any).loadEnvFile?.(".env.local"); } catch { /* optional */ }

  const routes = listRoutes();
  const activeCount = routes.filter((r) => r.properties.status === "active").length;
  console.log(`\nLoaded ${routes.length} routes (${activeCount} active).`);

  let rPass = 0, rRan = 0;
  if (activeCount === 0) {
    console.log(`\n--- Ranking SKIPPED: no routes are 'active' yet ---`);
    console.log(`  Promote routes (e.g. in /curate) and re-run; the ranking cases need active routes.`);
  } else {
    console.log(`\n--- Ranking (deterministic, no API) ---`);
    for (const c of rankingCases) {
      rRan++;
      const ranked = rankRoutes(routes, c.intent, c.closedIds);
      const { pass, detail } = c.assert(ranked, c.intent);
      line(pass, c.id, `${c.title}\n            ${detail}`);
      if (pass) rPass++;
    }
    console.log(`\nRanking: ${rPass}/${rankingCases.length} passed`);
  }

  let iPass = 0, iRan = 0;
  if (process.env.ANTHROPIC_API_KEY) {
    const { parseIntent } = await import("../src/lib/intent");
    console.log(`\n--- Intent parsing (calls Haiku) ---`);
    for (const c of intentCases) {
      iRan++;
      try {
        const intent = await parseIntent(c.prompt);
        const { pass, detail } = c.check(intent);
        line(pass, c.id, `"${c.prompt}"\n            ${detail}`);
        if (pass) iPass++;
      } catch (e) {
        line(false, c.id, `ERROR: ${(e as Error).message}`);
      }
    }
    console.log(`\nIntent: ${iPass}/${intentCases.length} passed`);
  } else {
    console.log(`\n--- Intent parsing SKIPPED ---`);
    console.log(`  Set ANTHROPIC_API_KEY to run the ${intentCases.length} LLM cases (a few cents of Haiku).`);
  }

  const failed = (rRan - rPass) + (iRan - iPass);
  console.log(`\nDone. ${failed} case(s) failed${activeCount === 0 ? " (ranking skipped -- no active routes)" : ""}${iRan === 0 ? " (intent cases not run)" : ""}.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
