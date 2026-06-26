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
import { pgTable, text, uuid, bigint, timestamp, boolean, jsonb, integer } from "drizzle-orm/pg-core";

// `user_id` columns hold a Neon Auth user id (neon_auth.users_sync.id), stored as text.

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
