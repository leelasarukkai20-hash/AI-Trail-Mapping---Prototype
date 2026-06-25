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

Both now work in this one repo; the route library lives here under
`route-library/` (no longer an external input).

## Current state

**Built and working:**
- Next.js (App Router, TS), mobile-first. Landing page (`page.tsx`): prompt →
  recommendation, plus Strava connect/status.
- **Recommendation engine, end to end:** prompt → `parseIntent` (Claude Haiku
  4.5, structured JSON output) → `rankRoutes` (deterministic scorer) → top + 2
  alternates, via `POST /api/recommend`. The rationale is built from the score
  breakdown — every claim maps to a real route field (grounded, not free-form).
- **Curated route library** under `route-library/`: 52 Marin routes as GeoJSON +
  JSON schema + TS types + tooling (scaffold/ingest/export/apply). Each route has
  a `status` (`draft`|`active`); promotion gates what's recommendable.
- **Safety filters in the ranker:** only `status: "active"` routes, and never a
  route in an active closure (`route-library/closures.json` + `lib/closures.ts`).
- **Conditions:** NOAA weather (`lib/weather.ts` + `GET /api/weather`), shown in
  the route panel.
- **Personalization:** pace ETA from the user's 90-day Strava average
  (`lib/pace.ts`). NOTE: this is a simple stub (avg pace + flat per-meter gain
  penalty), not the real pace-on-grade model yet.
- **Map + panel:** `components/RouteMap.tsx` (Mapbox GL JS); panel shows
  distance/gain/surface, rationale, ETA, weather, and alternates.
- **GPX export:** `GET /api/routes/[id]/gpx`.
- **/curate:** internal/admin tool both founders use to review, edit, and promote
  routes (map + form, schema-validated writes back to the geojson). A backend
  tool, not a user-facing page; relies on local filesystem writes, so it's run
  locally rather than deployed.
- **Strava OAuth:** authorize → callback (token exchange + CSRF) → me (90-day run
  pull) → disconnect; token refresh + 429 handling in `lib/strava.ts`. Tokens in
  a signed cookie (`lib/session.ts`) — SCAFFOLD ONLY.
- **Evals:** `evals/` harness (`npm run eval`). Ranking cases run offline; intent
  cases run with `ANTHROPIC_API_KEY`. Baseline: intent 8/8, ranking 10/10 (on
  promoted routes).

**Not done yet (see NEXT_STEPS.md):**
- Promote routes `draft → active` (in progress) — until then the engine returns
  no recommendations by design.
- Persistence: Postgres + magic-link auth (Resend) + invite gating. Still the
  signed-cookie scaffold — the demo→pilot boundary.
- Real pace-on-grade model (Python notebook → per-user JSON) to replace the stub.
- Strava webhook (rate-limit safety); `me` still does a live pull; no backoff on 429.
- Matching gaps: negation/exclusions, no-match confidence flag, out-of-coverage,
  time-budget→distance fallback.
- Feedback thumbs, share-to-Strava, cold-start onboarding.
- Compliance (privacy/terms + safety disclaimer) and launch ops.

## Architecture

- Frontend: Next.js + Mapbox GL JS on Vercel.
- Intent parsing: Claude Haiku 4.5, structured output (`@anthropic-ai/sdk`).
- Ranking: hand-tuned TypeScript scorer (no separate service); grounded rationale.
- Route library: GeoJSON validated by `ajv` against `route-library/schema/route.schema.json`.
- Conditions: NOAA api.weather.gov; closures as a maintained JSON file.
- Auth (planned): magic link (Resend). DB (planned): Vercel Postgres or Supabase.
- Strava: OAuth + (planned) webhook as serverless functions, rate-limit-aware.
- Pace model (planned): fit in a Python notebook, stored as per-user JSON.
- Everything serverless on Vercel. No PostGIS, no long-running services in V0.

## Layout

```
route-library/              # the curated library + tooling (see its own README)
  routes/<id>.geojson       # 52 curated Marin routes
  schema/route.schema.json  # the route contract (ajv-validated)
  types/route.ts            # TS mirror of the schema
  closures.json             # maintained trail-closure list (C2)
  scaffold/ingest/export/apply scripts
src/
  app/
    page.tsx                # Landing: prompt -> recommendation + Strava connect
    api/
      recommend/route.ts    # prompt -> intent -> rank -> top + 2 alternates
      routes/...            # GET routes, GET [id], GET [id]/gpx (export)
      weather/route.ts      # NOAA forecast for a lat/lon
      strava/{authorize,callback,me,disconnect}/route.ts
    curate/                 # internal admin tool (both founders): review/edit/promote routes; backend, not user-facing
  lib/
    intent.ts               # parseIntent (Haiku, structured output)
    ranker.ts               # rankRoutes scorer + status/closure filters + rationale
    closures.ts             # currently-closed route ids (reads closures.json)
    pace.ts                 # pace ETA from Strava avg (STUB; not grade-adjusted yet)
    weather.ts              # NOAA client
    routes.ts               # load/validate/save routes from route-library/
    strava.ts               # OAuth + API helpers, token refresh, 429 handling
    session.ts              # signed-cookie token store — SCAFFOLD ONLY
  components/RouteMap.tsx    # Mapbox GL JS map
evals/                      # recommendation-engine eval harness (npm run eval)
```

## Conventions

- TypeScript strict; `@/*` → `src/*`. Server code imports library types from
  `route-library/types/route`.
- Keep `lib/strava.ts` dependency-free (Vercel serverless).
- Secrets via env only. The app reads `.env.local` (Next convention):
  `ANTHROPIC_API_KEY`, Strava client id/secret + `OAUTH_STATE_SECRET`,
  `NEXT_PUBLIC_MAPBOX_TOKEN`. Never commit it.
- Strava scopes: request only what's used (`activity:read_all`,
  `profile:read_all`); don't add `activity:write` until share-to-Strava.
- Keep the ranker's rationale grounded — every claim maps to a real route field.
  Don't move rationale generation to a free-form LLM without a guardrail.
- Route content is edited via the spreadsheet round-trip or `/curate`, then
  validated with `npm run ingest` (in `route-library/`).

## Known TODOs / swap points

- `lib/session.ts` + `api/strava/callback`: replace the signed-cookie token store
  with Postgres + per-user identity before any real user testing.
- `api/strava/me`: live pull; move to webhook-first for the 2,000 req/day limit.
  No backoff/queue on 429 yet.
- `lib/pace.ts`: stub; replace with the per-user pace-on-grade model.
- `lib/ranker.ts`: matching gaps — negation/exclusions, no-match confidence flag,
  out-of-coverage (NEXT_STEPS item 2b).
- Routes ship as `draft`; promote in `/curate` to make them recommendable.
- `route-library/closures.json`: hand-maintained; verify the seeded Steep Ravine
  entry and review weekly.

## What stays manual (a Claude session can't do these)

- Registering the Strava API app (Strava website) + approving the consent screen.
- Promoting routes to `active` (an editorial/vetting judgment).
- Verifying real-world trail closures against official park alerts.

## How to run

```
npm install
# create .env.local with: ANTHROPIC_API_KEY, Strava client id/secret +
# OAUTH_STATE_SECRET, NEXT_PUBLIC_MAPBOX_TOKEN  (see STRAVA_SETUP.md for Strava)
npm run dev          # http://localhost:3000
npm run eval         # recommendation evals (ranking always; intent if key set)
```

Route-library tooling (scaffold/ingest/export/apply) lives in `route-library/`
with its own README.

## Good first task

"Read NEXT_STEPS.md. The recommendation engine works but matching has known gaps —
implement item 2b (negation/exclusions, a no-match confidence flag,
out-of-coverage) in `lib/intent.ts`/`lib/ranker.ts`, add eval cases in `evals/`,
and run `npm run eval`."
