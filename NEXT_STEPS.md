# Marin Trails — next steps (V0 pilot)

Where the build actually is, and what's left to a live, invite-only Marin pilot.
This supersedes the original scaffold-era plan (which assumed the route library,
ranking, and map were still mocked — they're built now).

## Done

- **Recommendation engine, end to end:** prompt → Haiku intent parse → deterministic
  ranker → top + 2 alternates, each with a grounded rationale and a pace ETA.
  Map view, route panel, weather, and GPX export all wired into the landing page.
- **Curated route library** (`route-library/`): 52 Marin routes, tagged + noted,
  schema-validated, with scaffold/ingest/export/apply tooling and an internal
  `/curate` admin tool (a backend tool both founders use, not user-facing).
- **Safety filters** in the ranker: active-only + closures (`closures.json`).
- **Strava OAuth:** connect / token refresh / 90-day pull / disconnect.
- **Eval harness** (`evals/`, `npm run eval`): intent 8/8, ranking 10/10 on
  promoted routes; skips ranking cleanly when nothing is active yet.

## Now / in progress

- **Promote routes `draft → active`** in `/curate`. Until some are active, the
  engine returns nothing by design — vet routes as you promote them.
- **Verify closures.** Confirm the seeded Steep Ravine entry against the official
  Mount Tamalpais State Park alert, and set a weekly review habit.

## Next — engine matching quality (item 2b)

In `lib/intent.ts` / `lib/ranker.ts`, with eval cases added to `evals/`:

- **Negation / exclusions** ("avoid exposed ridges", "nothing too technical") —
  add an exclude-tags concept; today these have nowhere to land (eval IP-05).
- **No-match confidence flag** — when the top score is low, return a "closest
  match, but…" signal so the UI doesn't present a poor fit as a real one (RK-09).
- **Out-of-coverage** — detect areas we don't cover ("Tahoe") and say so (IP-06).
- **Time-budget → distance** — "90 minutes" should resolve to a distance even
  without Strava pace (IP-03).

## Pilot-readiness plumbing (before inviting anyone)

- **Persistence:** Postgres + magic-link auth (Resend) + invite-code gating;
  replace the signed-cookie token store (`lib/session.ts`). The demo→pilot boundary.
- **Pace-on-grade model:** fit in a Python notebook, export per-user JSON, replace
  the `lib/pace.ts` stub. This is the Strava differentiator the pilot is testing.
- **Strava webhook + rate-limit safety:** `api/strava/webhook` (validation GET +
  events POST); refresh on event instead of the live pull in `me`; add backoff/
  queue on 429.
- **Feedback thumbs:** split "good match" vs "good route"; persist them (your key
  success signal — keep the two apart).
- **Compliance:** privacy policy + terms with a route-safety disclaimer.

## Validate, then launch

- **Dogfood:** run real recommended routes (check pace, rationale, GPX); confirm
  no recommendation hits a closure.
- **Cold-start onboarding** for no-Strava users (3–4 questions).
- Finalize the invite list (~30), the onboarding email, and send invites.

## Open decisions

- Whose Strava account owns the app registration (the name on the consent screen).
- The vetting bar for promoting a route to `active`.
- Liability/disclaimer wording in the footer + a terms page before invites.
