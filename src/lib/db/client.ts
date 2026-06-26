/**
 * Drizzle database client over the Neon serverless driver (HTTP) — works in
 * Vercel serverless and edge runtimes. Import `db` anywhere you need the DB:
 *
 *   import { db, schema } from "@/lib/db/client";
 *   const rows = await db.select().from(schema.users);
 *
 * Requires DATABASE_URL (the Vercel/Neon integration sets this automatically;
 * locally, put it in .env.local).
 */
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add the Neon integration in Vercel, or set it in .env.local.");
}

const sql = neon(connectionString);
export const db = drizzle(sql, { schema });
export { schema };
