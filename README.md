# Marin Trails — V0 pilot

A trail-run recommender for Marin County, built for an invite-only pilot
(~20–50 runners). Type what you want ("12 miles, lots of climbing, singletrack,
ocean views") and get a top pick + 2 alternates from a hand-curated route
library — with a personalized pace estimate from your Strava history and a
rationale grounded in real route data.

**Status:** feature-complete for the pilot except the grade-aware pace model
(fit in `pace-model/`, not yet wired in) and cold-start onboarding for
no-Strava users. See the launch checklist below.

## How it works

prompt → intent parse (Claude Haiku, structured output) → deterministic ranker
over 52 curated GeoJSON routes (active-only + closure safety filters) → top +
alternates with map, weather, GPX export, and feedback thumbs. Sign-in is Neon
Auth email OTP, gated by single-use invite codes; per-user Strava tokens and a
12 h-TTL stats cache live in Neon Postgres. Every prompt, recommendation, and
thumb is persisted — that's the pilot's learning data.

Deeper docs:

- [`CLAUDE.md`](./CLAUDE.md) — current state, architecture, layout, conventions
  (the working context; kept accurate).
- [`NEXT_STEPS.md`](./NEXT_STEPS.md) — roadmap: done / in progress / launch.
- [`STRAVA_SETUP.md`](./STRAVA_SETUP.md) — Strava API app registration.
- [`route-library/README.md`](./route-library/README.md) — route curation
  workflow (scaffold → ingest → promote).

## Run it locally

1. `npm install`
2. Create `.env.local` — every required var is in
   [`.env.example`](./.env.example): Strava client id/secret,
   `OAUTH_STATE_SECRET`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`,
   `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`,
   `APP_BASE_URL`.
3. `npm run dev` → <http://localhost:3000>

```
npm run eval             # engine evals: 18 ranking (offline) + 17 intent (needs API key)
npm run db:generate      # after editing src/lib/db/schema.ts
npm run db:migrate       # apply migrations to Neon
npm run db:seed-invites  # mint invite codes (--count/--note/--dry-run)
```

The `/curate` route-review tool is **dev-only** (it writes to the local
filesystem; the page and route-edit API 404 in production).

## Deploy (Vercel)

1. Import the repo in Vercel; add the same env vars. Set `APP_BASE_URL` to the
   deployed URL.
2. In Strava app settings, set **Authorization Callback Domain** to the Vercel
   domain (domain only — no scheme, no path).
3. The Neon integration sets `DATABASE_URL`; migrations are applied manually
   via `npm run db:migrate` (additive/nullable changes only — dev and prod
   share one database during the pilot).

## Pre-launch checklist (founders)

Code-complete items are tracked in `NEXT_STEPS.md`; these need **founder
action**, not code:

- [ ] **Privacy & Terms:** fill `EFFECTIVE_DATE` and `CONTACT_EMAIL` in
      `src/app/privacy/page.tsx` and `src/app/terms/page.tsx` (see the
      `TODO(founders)` comments at the top of each file), and have counsel
      review the liability clause in the terms.
- [ ] **Dogfood:** run a few recommended routes for real — check pace estimate,
      rationale, GPX; confirm nothing recommends a closed trail.
- [ ] **Closures:** verify `route-library/closures.json` against official park
      alerts weekly (current entry: re-check early August 2026).
- [ ] **Last draft route:** promote or drop `point-reyes-point-to-point`.
- [ ] **Invites:** seed real codes (`npm run db:seed-invites`), decide whether
      to arm the full login wall (one-line matcher swap in `src/proxy.ts`),
      send the onboarding email.
