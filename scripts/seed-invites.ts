/**
 * Seed single-use invite codes for the pilot.
 *
 *   npm run db:seed-invites                      # 30 codes
 *   npm run db:seed-invites -- --count 10        # custom count
 *   npm run db:seed-invites -- --note "wave 2"   # tag the batch
 *   npm run db:seed-invites -- --dry-run         # generate + print, no DB write
 *
 * Codes are readable trail-flavored slugs (e.g. foggy-ridge-42), lowercase —
 * redemption normalizes to lowercase, so case can't bite anyone. Existing
 * codes are never overwritten (insert skips conflicts); the script prints
 * exactly what was inserted so you can paste codes into invite emails.
 */

// Load env before importing the db client (which throws without DATABASE_URL).
// Imports of the client must therefore be dynamic, after this runs.
try { process.loadEnvFile?.(".env.local"); } catch { /* optional */ }
try { process.loadEnvFile?.(".env"); } catch { /* optional */ }

const ADJECTIVES = [
  "foggy", "mossy", "golden", "windy", "shady", "rocky", "misty", "sunny",
  "quiet", "steep", "green", "coastal", "dusty", "early", "lupine", "madrone",
];
const NOUNS = [
  "ridge", "creek", "summit", "meadow", "grove", "hawk", "bobcat", "fern",
  "switchback", "saddle", "outcrop", "seep", "laurel", "coyote", "quail", "tanoak",
];

function makeCode(): string {
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10–99
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${num}`;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const count = Number(arg("count") ?? 30);
  const note = arg("note") ?? `seeded ${new Date().toISOString().slice(0, 10)}`;
  const dryRun = process.argv.includes("--dry-run");
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    console.error("--count must be an integer between 1 and 500");
    process.exit(1);
  }

  // Over-generate a bit so random collisions within the batch don't shrink it.
  const codes = new Set<string>();
  while (codes.size < count) codes.add(makeCode());

  if (dryRun) {
    console.log(`[dry-run] would insert ${codes.size} codes (note: "${note}"):\n`);
    for (const c of codes) console.log(`  ${c}`);
    return;
  }

  const { db, schema } = await import("../src/lib/db/client");
  const inserted = await db
    .insert(schema.inviteCodes)
    .values([...codes].map((code) => ({ code, note })))
    .onConflictDoNothing({ target: schema.inviteCodes.code })
    .returning({ code: schema.inviteCodes.code });

  console.log(`Inserted ${inserted.length} invite codes (note: "${note}"):\n`);
  for (const row of inserted) console.log(`  ${row.code}`);
  if (inserted.length < codes.size) {
    console.log(`\n(${codes.size - inserted.length} collided with existing codes and were skipped.)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
