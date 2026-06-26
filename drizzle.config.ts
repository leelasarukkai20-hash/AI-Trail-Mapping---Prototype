import type { Config } from "drizzle-kit";

// Load DATABASE_URL from .env.local / .env so `npm run db:*` works locally
// (drizzle-kit doesn't read Next's env files on its own).
try { (process as any).loadEnvFile?.(".env.local"); } catch { /* optional */ }
try { (process as any).loadEnvFile?.(".env"); } catch { /* optional */ }

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // Only manage our own tables; never touch the Neon-managed `neon_auth` schema.
  schemaFilter: ["public"],
} satisfies Config;
