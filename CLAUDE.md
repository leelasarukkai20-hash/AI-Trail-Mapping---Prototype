# CLAUDE.md — Marin Trails (V0 pilot)

Context for Claude Code working in this repo. Read `NEXT_STEPS.md` for the full
roadmap and `STRAVA_SETUP.md` for Strava registration.

## What this is

V0 of a trail-run recommender for a Marin pilot (~20–50 invited runners). A user
types a natural-language prompt ("12 miles, lots of climbing, singletrack,
ocean views"), and the app matches it to a hand-curated Marin route, with pace
estimates personalized from the user's Strava history.

Two founders, split workstreams:
- **Leela (this repo's owner): Strava integration + frontend.**
- **Emma: the curated route library** (~50–100 Marin routes as GeoJSON).

This repo is Leela's part. Treat Emma's route library as an external input that
will arrive later — mock it where needed so we're never blocked on it.

## Current state (as of scaffold)

Done:
- Next.js (App Router, TypeScript) scaffold, mobile-first.
- Full Strava OAuth flow: `authorize` → `callback` (token exchange + CSRF) →
  `me` (pulls last 90 days of runs as proof) → `disconnect`.
- Token refresh, 90-day run pull, and `429` rate-limit handling in
  `src/lib/strava.ts`.
- Landing page with prompt input + Strava connect/status UI.

Not done yet (see NEXT_STEPS.md milestones):
- Postgres + magic-link auth + invite gating (currently tokens live in a signed
  cookie — scaffold only).
- Webhook handler for new activities.
- Pace-on-grade model integration.
- Mapbox map view + route panel.
- GPX export, share-to-Strava, thumbs feedback.
- Real route library integration.

## Architecture (from the scope doc)

- Frontend: Next.js + Mapbox GL JS, deployed to Vercel.
- Auth: magic link (Resend). DB: Vercel Postgres or Supabase.
- Strava: OAuth + webhook as serverless functions, rate-limit-aware.
- Intent parsing + rationale: Claude Haiku 4.5, structured output.
- Ranking: hand-tuned TypeScript scoring (no separate service).
- Pace-on-grade model: fit in a Python notebook, stored as per-user JSON.
- Everything serverless on Vercel. No PostGIS, no long-running services in V0.

## Layout

```
src/
  app/
    page.tsx                 # Landing: prompt input + Strava connect/status
    layout.tsx, globals.css  # Mobile-first shell
    api/strava/
      authorize/route.ts     # Redirect to Strava consent
      callback/route.ts      # Code -> token exchange, CSRF check
      me/route.ts            # Athlete + last-90-day run summary
      disconnect/route.ts    # Clear session
  lib/
    strava.ts                # OAuth + API helpers, no external deps
    session.ts               # Signed-cookie token store — SCAFFOLD ONLY
```

## Conventions

- TypeScript, strict mode. `@/*` path alias maps to `src/*`.
- Keep `src/lib/strava.ts` dependency-free so it runs on Vercel serverless.
- Secrets come from env vars only — never hardcode. See `.env.example`.
- Request only the scopes we use (`activity:read_all`, `profile:read_all`).
  Don't add `activity:write` until building share-to-Strava, and scope it tightly.

## Known TODOs / swap points

- `src/lib/session.ts` and `api/strava/callback/route.ts`: replace the
  signed-cookie token store with Postgres before any real user testing.
- `api/strava/me/route.ts`: does a live pull; move to webhook-first to respect
  the 2,000 req/day Strava limit.
- Rate limiting: helpers throw `RateLimitError` on 429, but backoff/queueing
  isn't implemented.

## What stays manual (Claude Code can't do these)

- Registering the Strava API app to get client ID/secret (Strava website).
- Clicking "Connect with Strava" and approving the consent screen.
- Deciding whose Strava account owns the app (a pilot open question).

## How to run

```
npm install
cp .env.example .env   # then fill in Strava keys + OAUTH_STATE_SECRET
npm run dev            # http://localhost:3000
```

Note: this scaffold was authored but not yet build-tested. Run
`npm install && npm run build` once and fix any issues before deploying.

## Good first task

"Read NEXT_STEPS.md, then help me get Milestone 1 working: install deps, verify
the build, and walk me through registering the Strava app and testing the OAuth
flow locally."
