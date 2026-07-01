/**
 * Database schema (Layer 0) — the foundation every pilot feature attaches to.
 * Drizzle ORM over Neon Postgres.
 *
 * IDENTITY: sign-in is handled by **Neon Auth** (managed magic-link). Neon Auth
 * owns the user records in `neon_auth.users_sync` (its `id` is a text string), so
 * we do NOT define our own users table here. Instead, `user_id` columns below hold
 * the Neon Auth user id (text). We don't put a database foreign key on it — that
 * table lives in a Neon-managed schema — so the reference is enforced in app code.
 *
 * drizzle.config sets `schemaFilter: ["public"]` so drizzle-kit never tries to
 * create, alter, or drop anything in the Neon-managed `neon_auth` schema.
 *
 * Tables (all in `public`):
 *   invite_codes     - gate who can sign up
 *   strava_tokens    - per-user Strava OAuth tokens (replaces the signed cookie)
 *   prompts          - every natural-language request a user makes
 *   recommendations  - what the engine returned (predicted time + confidence, for
 *                      the predicted-vs-actual measurement in Layer 2)
 *   feedback         - thumbs, split into "good match" vs "good route" (FE6)
 */
import { pgTable, text, uuid, bigint, timestamp, boolean, jsonb, integer, doublePrecision } from "drizzle-orm/pg-core";

// `user_id` columns hold a Neon Auth user id (neon_auth.users_sync.id), stored as text.
//
// Decision (WI-5, kept text — supersedes the open "switch to uuid" item):
// Better Auth generates ids as random strings by default (not UUIDs), and Neon
// exposes `auth.user_id()` as text. `text` works whether or not the id happens
// to be UUID-shaped and matches the helper. Only migrate to `uuid` if you want
// native uuid indexing AND the live type is genuinely uuid — neither is true
// for the pilot.

export const inviteCodes = pgTable("invite_codes", {
  code: text("code").primaryKey(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  usedByUserId: text("used_by_user_id"), // Neon Auth user id, once redeemed
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const stravaTokens = pgTable("strava_tokens", {
  userId: text("user_id").primaryKey(), // Neon Auth user id
  athleteId: bigint("athlete_id", { mode: "number" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // Cached 90-day activity summary, refreshed at most every STATS_TTL (see
  // lib/strava-stats.ts). Keeps /me and /recommend off Strava's rate limits:
  // without this, every homepage load + prompt did a full 90-day pull.
  athleteName: text("athlete_name"),
  avgPaceMinPerKm: doublePrecision("avg_pace_min_per_km"), // null = no usable runs
  runsLast90: integer("runs_last_90"),
  metersLast90: doublePrecision("meters_last_90"),
  statsRefreshedAt: timestamp("stats_refreshed_at", { withTimezone: true }), // null = never computed
});

export const prompts = pgTable("prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"), // Neon Auth user id (nullable for pre-sign-in prompts)
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recommendations = pgTable("recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptId: uuid("prompt_id").references(() => prompts.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  intent: jsonb("intent"),
  topRouteId: text("top_route_id"),
  alternateRouteIds: jsonb("alternate_route_ids").$type<string[]>(),
  confidence: text("confidence"), // "good" | "low" from matchConfidence
  predictedMinutes: integer("predicted_minutes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  recommendationId: uuid("recommendation_id").references(() => recommendations.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  routeId: text("route_id"),
  goodMatch: boolean("good_match"), // did the recommendation fit what they asked for?
  goodRoute: boolean("good_route"), // was the route itself any good?
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
