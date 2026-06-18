# Leela's next steps — Strava auth + frontend

Your two workstreams from the scope doc, sequenced. Emma owns the route
database (sub-task step 1), so this plan mocks route data where needed so you're
never blocked waiting on her.

## Build order at a glance

```
[Done now]  0. Scaffold + Strava OAuth flow (this repo)
[You, ~1d]  1. Register Strava app, run OAuth end-to-end locally
[You, ~1d]  2. Deploy to Vercel, confirm OAuth works in prod
[You, ~2d]  3. Postgres + magic-link auth + invite gating  ← unblocks real tokens
[You, ~2d]  4. 90-day activity backfill + pace-on-grade model
[You, ~1d]  5. Webhook handler for new activities
[You, ~3d]  6. Map view (Mapbox) + route panel — using a mock route
[Both]      7. Swap mock routes for Emma's GeoJSON library
[You, ~2d]  8. GPX export, share-to-Strava, thumbs feedback, empty states
```

Critical path: **1 → 2 → 3** unblocks everything downstream. Do the Strava app
registration today — brand review can take time and it gates real-user testing.

---

## Milestone 1 — Get OAuth working locally (do this first)

The code is built. To make it run:

1. `npm install` in the `marin-trails` folder.
2. Follow `STRAVA_SETUP.md` to register the app and fill `.env`.
3. `npm run dev`, click **Connect with Strava**, approve.
4. Success = redirected back showing your name + 90-day run count.

This proves the whole OAuth round-trip (authorize → consent → callback → token
exchange → live API call) end to end. Everything else builds on it.

## Milestone 2 — Deploy to Vercel

- Push to GitHub, import in Vercel, add env vars.
- Set `APP_BASE_URL` to the Vercel URL and update Strava's callback domain.
- Re-test the connect flow in production.

## Milestone 3 — Persistence (the real unlock)

Right now tokens live in a signed cookie (scaffold only). Before inviting users:

- **Postgres** (Vercel Postgres or Supabase). Tables: `users`, `strava_tokens`,
  `prompts`, `feedback`.
- **Magic-link auth** (Resend) so a user has a stable identity to attach tokens
  and history to.
- **Invite-code gating** so only your ~30 invitees get in.
- Replace `src/lib/session.ts` with DB-backed token storage keyed by user id.

This is the boundary between "demo" and "pilot-ready." Files already mark the
exact swap points (`TODO` in `session.ts`, `callback/route.ts`).

## Milestone 4 — Activity backfill + pace model

- On connect, pull last 90 days of runs (helper `getRecentRuns` already does
  this) and store them.
- Fit the **pace-on-grade model** (your Python notebook), export per-user JSON,
  store it. Recompute on each sync.
- Expose estimated moving time + confidence interval to the frontend — this is
  the Strava-powered differentiator the whole pilot is testing.

## Milestone 5 — Webhooks (rate-limit safety)

- Add `api/strava/webhook` (GET for the subscription validation handshake, POST
  for events). Register the subscription once.
- On a new activity event, refresh that user's runs and recompute their pace
  model. This replaces polling and keeps you well under the 2,000/day limit.

## Milestone 6 — Map + route panel (frontend)

Don't wait on Emma's routes. Define the GeoJSON schema together (it's her
sub-task #1 too: "Define route metadata schema"), then hardcode **one or two
mock routes** matching that schema and build against them:

- Mapbox GL JS map showing the top route; alternates toggleable.
- Bottom sheet (mobile) / side panel (desktop) with distance, elevation gain,
  surface breakdown, elevation profile, personalized time, "why this matched".
- Prompt input already exists on the landing page; wire it to call the (stubbed)
  ranking endpoint.

When Emma's library lands, swap the mock for her GeoJSON files — schema match
means little else changes.

## Milestone 7 — Integrate the real route library

Load Emma's `~50–100` GeoJSON routes into memory, pass through the LLM ranker
(her/your shared LLM workstream), render top + 2 alternates.

## Milestone 8 — Per-route actions + feedback

- **GPX export** on every route (derive from the LineString geometry).
- **Share to Strava as planned route** (needs an `activity:write`-adjacent flow;
  check current Strava routes API support — may require a workaround).
- **Thumbs feedback** UI → write to the `feedback` table (your success metric #3).
- Error and empty states; cold-start onboarding (3–4 questions if no Strava).

---

## Decisions to close with Emma (from the scope's open questions)

- **#5 Whose Strava account owns the app registration?** Decide before M1 — it's
  the account name users see on the consent screen.
- **GeoJSON route schema** — agree the exact properties now so M6 mock data and
  her real data line up.
- **#6 Liability / disclaimer** — a one-paragraph route-safety disclaimer in the
  footer (already stubbed in `page.tsx`) and a basic terms page before invites.
