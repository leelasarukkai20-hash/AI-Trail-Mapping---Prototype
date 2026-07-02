# CLAUDE.md — Marin Trails (V0 pilot)

Context for a Claude session working in this repo. See `NEXT_STEPS.md` for the
roadmap and `STRAVA_SETUP.md` for Strava registration.

## What this is

V0 of a trail-run recommender for a Marin pilot (~20–50 invited runners). A user
types a natural-language prompt ("12 miles, lots of climbing, singletrack, ocean
views"); the app parses it, ranks a library of hand-curated Marin routes, and
returns a top pick + 2 alternates with a personalized pace estimate and a
rationale grounded in real route data.

Two founders:
- **Leela:** Strava integration + frontend.
- **Emma:** the curated route library + the recommendation/ranking layer.

Both work in this one repo; the route library lives under `route-library/`.

## Current state

**Built and working:**
- **Recommendation engine, end to end:** prompt → `parseIntent` (Claude Haiku
  4.5, structured JSON output) → `rankRoutes` (deterministic scorer) → top + 2
  alternates, via `POST /api/recommend`. Rationale is built from the score
  breakdown — every claim maps to a real route field. Handles
  negation/exclusions, out-of-coverage, time-budget→distance, and a
  match-confidence signal (vague or poorly-matched prompts render as "Closest
  match" in the UI, not a confident pick).
- **Curated route library** under `route-library/`: 52 Marin routes (51
  `active`, 1 `draft`) as GeoJSON + JSON schema + TS types + tooling. Only
  `active` routes are recommendable.
- **Safety filters in the ranker:** active-only, and never a route in an active
  closure (`route-library/closures.json` + `lib/closures.ts`).
- **Real auth (Layer 1, complete):** Neon Auth email-OTP sign-in (managed Better
  Auth; `src/lib/auth/`), per-user Strava tokens in Postgres, invite-code gating
  (`/onboarding/invite`, `src/lib/auth/invites.ts`, seed via
  `npm run db:seed-invites`), sign-in/out header, and route-protection
  middleware in `src/proxy.ts` (Next 16 name for middleware) — currently only
  guards `/onboarding/*`; a commented matcher swap arms a full login wall.
- **Strava, rate-limit safe:** OAuth authorize → callback (CSRF state cookie +
  scope check + invite check) → disconnect (revokes via Strava deauthorize).
  90-day stats (avg pace, run count, mileage, athlete name) are **cached in
  Postgres with a 12 h TTL** (`lib/strava-stats.ts`); `/api/strava/me` and
  recommend read the cache, refresh only when stale, and serve stale data if
  Strava is down/429. Token refresh in `lib/strava.ts`.
- **Data loop:** every prompt + recommendation persisted (`prompts`,
  `recommendations` tables; includes out-of-coverage and no-match with
  `top=null`; anonymous usage logged with `user_id` null). Feedback thumbs on
  each result card → `POST /api/feedback`, split into `good_match` (engine
  quality) vs `good_route` (library quality).
- **DB:** Drizzle ORM over Neon Postgres (`src/lib/db/`); migrations in
  `drizzle/`. `user_id` columns are `text` (Neon Auth ids — decided, don't
  revisit). drizzle-kit is scoped to the `public` schema; never touch
  `neon_auth.*`.
- **Personalization:** pace ETA from the cached 90-day Strava average
  (`lib/pace.ts`). NOTE: still the simple stub (avg pace + flat per-meter gain
  penalty); the grade-aware model in `pace-model/` is fit but not yet wired in.
- **Conditions:** NOAA weather (`lib/weather.ts`); **map + panel**
  (`components/RouteMap.tsx`, Mapbox GL JS); **GPX export**
  (`GET /api/routes/[id]/gpx`).
- **/curate:** internal admin tool to review/edit/promote routes. **Dev-only:**
  the page and `PUT /api/routes/[id]` return 404 in production (route edits
  write to the local filesystem).
- **Compliance drafts:** `/privacy` + `/terms` (linked from the landing footer),
  aligned with actual data practices. EFFECTIVE_DATE / CONTACT_EMAIL
  placeholders still need founder values + counsel review.
- **Evals:** `evals/` harness (`npm run eval`). Baseline: 18/18 ranking
  (offline), 17/17 intent (needs `ANTHROPIC_API_KEY`); flaky LLM cases retry
  once and are flagged `[flaky]`.

**Not done yet (see NEXT_STEPS.md):**
- Wire the pace-on-grade model (`pace-model/` — Leela) into `lib/pace.ts`.
- Strava webhook (event-driven stats refresh; TTL cache is the current guard).
- Cold-start onboarding for no-Strava users.
- Compliance placeholders + launch ops (seed real invites, dogfood, send).

## Architecture

- Frontend: Next.js 16 (App Router, TS, React 19) + Mapbox GL JS on Vercel.
- Auth: **Neon Auth** (managed Better Auth, email OTP). No hooks/plugins
  available — anything like invite gating is enforced app-side, post-sign-in.
- DB: Neon Postgres via Drizzle (`drizzle-orm/neon-http`), serverless-safe.
- Intent parsing: Claude Haiku 4.5, structured output (`@anthropic-ai/sdk`).
- Ranking: hand-tuned TypeScript scorer; grounded rationale.
- Route library: GeoJSON validated by `ajv` against
  `route-library/schema/route.schema.json`.
- Conditions: NOAA api.weather.gov; closures as a maintained JSON file.
- Strava: OAuth serverless routes; stats cached in Postgres (12 h TTL).
- Pace model: fit in `pace-model/` (`fetch_streams.ts` + `fit.py` → per-user
  JSON); integration pending.
- Everything serverless on Vercel. No PostGIS, no long-running services in V0.

## Layout

```
route-library/              # curated library + tooling (see its own README)
  routes/<id>.geojson       # 52 curated Marin routes
  schema/route.schema.json  # the route contract (ajv-validated)
  closures.json             # maintained trail-closure list
pace-model/                 # grade-aware pace model fit (Leela); JSON per user
drizzle/                    # generated SQL migrations (npm run db:migrate)
scripts/seed-invites.ts     # seed invite codes (npm run db:seed-invites)
src/
  proxy.ts                  # Next 16 middleware: guards /onboarding/*; wall switch
  app/
    page.tsx                # landing: prompt -> recommendation, auth header, thumbs
    (auth)/                 # Neon Auth UI route group (Tailwind scoped here ONLY)
    onboarding/invite/      # invite-code redemption screen
    privacy/ terms/         # compliance pages (draft)
    api/
      recommend/route.ts    # intent -> rank -> top + alternates; logs rows
      feedback/route.ts     # thumbs -> feedback table
      me/route.ts           # { user, invited } for the header
      invite/redeem/        # race-safe invite redemption
      routes/...            # GET routes / [id] / gpx; PUT [id] is DEV-ONLY
      weather/route.ts      # NOAA forecast for a lat/lon
      strava/{authorize,callback,me,disconnect}/route.ts
      auth/[...path]/       # Neon Auth handler
    curate/                 # internal admin tool — DEV-ONLY (404 in production)
  lib/
    intent.ts               # parseIntent (Haiku, structured output)
    ranker.ts               # scorer + filters + rationale + matchConfidence
    closures.ts pace.ts weather.ts routes.ts
    strava.ts               # OAuth + API helpers, refresh, deauthorize, 429
    strava-store.ts         # per-user token rows (strava_tokens)
    strava-stats.ts         # cached 90-day summary, 12 h TTL, stale-on-429
    oauth-state.ts          # CSRF state cookie for the OAuth round-trip
    auth/{server,client,session,invites}.ts   # Neon Auth + helpers
    db/{client,schema}.ts   # Drizzle over Neon
  components/RouteMap.tsx
evals/                      # eval harness (npm run eval): 18 ranking + 17 intent
```

## Conventions

- TypeScript strict; `@/*` → `src/*`. Server code imports library types from
  `route-library/types/route`.
- Keep `lib/strava.ts` dependency-free (Vercel serverless).
- Secrets via env only (`.env.local`, never committed — see `.env.example`):
  `ANTHROPIC_API_KEY`, Strava client id/secret, `OAUTH_STATE_SECRET`,
  `NEXT_PUBLIC_MAPBOX_TOKEN`, `DATABASE_URL`, `NEON_AUTH_BASE_URL`,
  `NEON_AUTH_COOKIE_SECRET`, `APP_BASE_URL`.
- Strava scopes: request only what's used (`activity:read_all`,
  `profile:read_all`); don't add `activity:write` until share-to-Strava.
- Keep the ranker's rationale grounded — every claim maps to a real route field.
  Don't move rationale generation to a free-form LLM without a guardrail.
- Don't hit Strava directly from request handlers — go through
  `lib/strava-stats.ts` (the cache) so the rate-limit budget holds.
- Tailwind v4 is scoped to `src/app/(auth)/` only; do not add global Tailwind.
- Route content is edited via the spreadsheet round-trip or `/curate` (locally),
  then validated with `npm run ingest` (in `route-library/`).
- Schema changes: edit `src/lib/db/schema.ts` → `npm run db:generate` →
  `npm run db:migrate`. Additive/nullable changes only while the pilot shares
  one database.

## Known TODOs / swap points

- `lib/pace.ts`: stub; swap in the `pace-model/` grade-aware model (with Leela).
- `api/strava/webhook`: not built; the 12 h stats cache is the interim guard.
- Cold-start onboarding (no-Strava default pace) not built.
- `src/app/privacy/page.tsx` + `terms/page.tsx`: EFFECTIVE_DATE / CONTACT_EMAIL
  placeholders; liability clause needs counsel.
- `route-library/closures.json`: hand-maintained; review weekly (current entry
  says re-check early August 2026).
- `point-reyes-point-to-point` is the one remaining `draft` route.

## What stays manual (a Claude session can't do these)

- Strava API app registration/settings (Strava website).
- Promoting routes to `active` (editorial judgment) and verifying real-world
  closures against official park alerts.
- Filling the compliance placeholders; sending invites.

## How to run

```
npm install
# create .env.local (see .env.example for every required var)
npm run dev              # http://localhost:3000
npm run eval             # 18 ranking cases always; 17 intent cases if key set
npm run db:generate      # after editing src/lib/db/schema.ts
npm run db:migrate       # apply migrations to Neon
npm run db:seed-invites  # mint invite codes (--count/--note/--dry-run)
```

Route-library tooling (scaffold/ingest/export/apply) lives in `route-library/`
with its own README. The `/curate` tool only works in dev.

## Good first task

"Read NEXT_STEPS.md. The pace estimate still uses the flat-gain stub in
`lib/pace.ts`; the fitted grade-aware model lives in `pace-model/`. Coordinate
the integration: load the per-user model JSON, replace
`estimateMovingTimeMinutes`, and add eval or unit coverage for the new ETA."
