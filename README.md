# Marin Trails — V0 scaffold (Strava auth + frontend)

Next.js (App Router) scaffold for the Marin pilot. This covers Leela's two
workstreams from the scope doc: **Strava integration** and **frontend**. The
route library, LLM ranking, and pace model are stubbed with clear `TODO`
markers where they plug in.

## What's here

```
src/
  app/
    page.tsx                     # Landing: prompt input + Strava connect/status
    layout.tsx, globals.css      # Mobile-first shell
    api/strava/
      authorize/route.ts         # Step 1: redirect to Strava consent
      callback/route.ts          # Step 2: code -> token exchange, CSRF check
      me/route.ts                # Proof: pulls athlete + last-90-day runs
      disconnect/route.ts        # Clears session
    curate/                      # /curate: internal route review + edit tool
    api/routes/                  # GET/PUT for the curate viewer
  lib/
    strava.ts                    # OAuth + API helpers (no deps), token refresh
    session.ts                   # Signed-cookie token store (SCAFFOLD ONLY)
    routes.ts                    # Filesystem + schema validation for /curate
```

## The curate viewer at `/curate`

An internal tool for reviewing and editing the route library — map + form per
route, writes back to `route-library/routes/<id>.geojson` with schema
validation. Run `npm run dev`, set `NEXT_PUBLIC_MAPBOX_TOKEN` in `.env.local`,
and open <http://localhost:3000/curate>. Full workflow lives in
[`route-library/README.md`](./route-library/README.md). Not deployed — it
relies on local filesystem writes.

## Run it locally

1. `npm install`
2. Register a Strava API app and fill in `.env` — see `STRAVA_SETUP.md`.
   ```
   cp .env.example .env
   # then paste your client id/secret and run: openssl rand -hex 32  -> OAUTH_STATE_SECRET
   ```
3. `npm run dev` and open http://localhost:3000
4. Click **Connect with Strava**, approve, and you should land back with
   "Strava connected" plus your 90-day run count.

> Note: this scaffold was authored but not build-tested in-session (no sandbox).
> Run `npm install && npm run build` once locally to confirm before deploying.

## Deploy to Vercel

1. Push to GitHub, import the repo in Vercel.
2. Add the same env vars in Vercel project settings. Set
   `APP_BASE_URL` to your Vercel URL (e.g. `https://marin-trails.vercel.app`).
3. In Strava app settings, set **Authorization Callback Domain** to your Vercel
   domain (domain only, no `https://`, no path).

## Important scaffold caveats (read before the real pilot)

- **Token storage is a signed cookie**, not a database. Fine for testing the
  OAuth round-trip; replace with Postgres before inviting users. See the `TODO`
  in `src/lib/session.ts` and `callback/route.ts`.
- **No webhook handler yet** — `me/route.ts` does a live pull. The pilot wants a
  webhook-first design for rate limits (see plan).
- **Rate limiting**: helpers surface `429` as `RateLimitError`; backoff/queueing
  is not implemented yet.
