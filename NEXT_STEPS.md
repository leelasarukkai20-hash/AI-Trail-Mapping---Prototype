# Marin Trails — next steps (V0 pilot)

Where the build actually is, and what's left to a live, invite-only Marin pilot.

## Done

- **Recommendation engine, end to end:** prompt → Haiku intent parse → deterministic
  ranker → top + 2 alternates, each with a grounded rationale and a pace ETA.
  Map view, route panel, weather, GPX export. Negation/exclusions, no-match
  confidence (surfaced in the UI as "Closest match"), out-of-coverage detection,
  and time-budget→distance all handled.
- **Curated route library** (`route-library/`): 52 Marin routes (51 active,
  1 draft), schema-validated, with tooling and the internal `/curate` admin tool
  (dev-only: `/curate` and the route-edit API 404 in production).
- **Safety filters** in the ranker: active-only + closures (`closures.json`).
- **Real auth + identity (Layer 1):** Neon Auth email-OTP sign-in, per-user Strava
  tokens in Postgres, invite-code gating (`/onboarding/invite`,
  `npm run db:seed-invites`), sign-in/out header, and a disarmed login wall
  (`src/proxy.ts` — one-line matcher change arms it at launch).
- **Strava, rate-limit safe:** OAuth connect/refresh/disconnect (with deauthorize
  on Strava's side); 90-day stats cached in Postgres with a 12 h TTL
  (`lib/strava-stats.ts`) so `/me` and `/recommend` don't hit Strava per request;
  stale data served if Strava is down or rate-limiting.
- **Data loop:** every prompt + recommendation persisted (including
  out-of-coverage and no-match); feedback thumbs on every result card, split into
  "good match" (engine quality) vs "good route" (library quality).
- **Compliance drafts:** privacy + terms pages (linked from the landing footer)
  aligned with actual data practices; placeholders remain (see below).
- **Eval harness** (`evals/`, `npm run eval`): 18 ranking + 17 intent cases;
  flaky LLM cases retry once and are flagged.

## Now / in progress

- **Pace-on-grade model (Emma + Leela):** `pace-model/` has the fit
  (`fetch_streams.ts` + `fit.py`) and a per-user JSON. Remaining: wire model
  output into `lib/pace.ts` (replace the flat gain-penalty stub), decide where
  per-user model JSON lives (DB column vs file), and refresh it when stats
  refresh. This is the Strava differentiator the pilot is testing.
- **Compliance placeholders (founders):** set EFFECTIVE_DATE + CONTACT_EMAIL in
  `src/app/privacy/page.tsx` and `src/app/terms/page.tsx`; have the liability
  clause reviewed before invites go out.
- **Verify closures weekly.** Current entry (Old Springs boardwalk work) says
  check back early August 2026.

## Next

- **Strava webhook** (`api/strava/webhook`): event-driven stats refresh instead
  of TTL polling; the cache layer stays as the fallback.
- **Cold-start onboarding** for no-Strava users (3–4 questions → default pace).
- **Promote or drop** the last draft route (`point-reyes-point-to-point`).

## Validate, then launch

- **Dogfood:** run real recommended routes (check pace, rationale, GPX); confirm
  no recommendation hits a closure; watch the first prompts/feedback rows come in.
- Seed the real invite codes (`npm run db:seed-invites`), finalize the ~30-person
  list and onboarding email, arm the login wall if desired (see `src/proxy.ts`),
  and send invites.

## Open decisions

- Whose Strava account owns the app registration (the name on the consent screen).
- Whether launch keeps the logged-out demo usable or arms the full wall
  (`src/proxy.ts` matcher).
- Anonymous prompt logging is ON (user_id null) — revisit if it feels wrong.
- The vetting bar for promoting future routes to `active`.
