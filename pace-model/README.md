# Pace-on-grade model

Per-user trail-running pace as a function of grade, fit from Strava streams.

The TS recommender reads a single global curve from `leela.json` and scales it
by each user's average pace from their 90-day Strava history. That's "global
curve, per-user baseline" — enough for the V0 pilot. Per-user curves come later.

## Files

- `fetch_streams.ts` — TS script: pull last 90 days of activities + per-second
  streams (time/distance/altitude/grade_smooth) from Strava, write to
  `streams/<activity_id>.json`. Idempotent — skips already-downloaded files.
- `fit.py` — Python script: read all streams, bin per-second pace by grade,
  compute median pace per bin, write `leela.json`. Pure stdlib (no numpy/pandas
  required).
- `leela.json` — fitted curve, committed to the repo. Currently a placeholder
  based on empirical trail-running heuristics; gets overwritten when you run
  the pipeline below.
- `streams/` — raw per-activity JSON, gitignored.

## Workflow (one-time setup; rerun whenever you have more Strava data)

1. **Get a personal Strava access token.**
   - Go to https://www.strava.com/settings/api (logged in as the app owner).
   - Below the app details, you'll see "Your Access Token" + "Your Refresh
     Token". The access token expires after ~6 hours; if it does, refresh via
     the OAuth-like flow on that page (or just regenerate).
   - **Important:** make sure the token has `activity:read_all` scope (it does
     by default for the app owner, but verify).

2. **Add the token to `.env`:**

   ```
   STRAVA_PERSONAL_ACCESS_TOKEN=<paste it here>
   ```

   This is intentionally a separate env var from the user-facing OAuth
   tokens; it's only for this offline fitting pipeline.

3. **Pull streams:**

   ```sh
   npm run fetch-streams
   ```

   Pulls last 90 days of runs (re-runs of the script skip already-downloaded
   activities, so safe to re-run any time). One Strava call per activity — at
   ~50–100 runs, well under the 200/15min limit.

4. **Fit the curve:**

   ```sh
   python3 pace-model/fit.py
   ```

   Writes `leela.json`. Includes a baseline pace + per-grade-bin median pace
   multipliers. Logs how many samples landed in each bin so you can sanity-
   check it.

5. **Commit `leela.json`.** The TS recommender picks it up on next dev-server
   restart (it's a static JSON import).

## How the curve is used at inference

`src/lib/pace.ts` reads `leela.json` once at module load. For each route:

1. Walk the GeoJSON LineString geometry segment-by-segment.
2. For each segment compute (Δdistance, Δelevation) → grade.
3. Look up the pace multiplier at that grade (linear interp between bins,
   clamped at the curve's extremes).
4. Segment time = Δdistance_km × user's baseline_pace_min_per_km × multiplier.
5. Sum across all segments → total moving time minutes.

The user's baseline pace is `avgPaceFromRuns(runs)` — same helper as today.
"Personalization" today = scaling Leela's grade curve to the user's flat-
ground pace. Per-user curves (everyone gets their own shape) come later.

## What's NOT in this V0

- **Per-user grade curves.** Everyone uses Leela's. The right fix is fitting
  per-user; needs streams fetcher in the production server + a runtime fitter
  (Python service or TS port of `fit.py`).
- **Confidence interval.** Defer — the fit script logs per-bin sample sizes,
  which is enough to spot weak parts of the curve manually for now.
- **Treadmill vs trail correction.** Strava's `grade_smooth` is fine for
  outdoor running; if you start training indoors with altitude=constant, the
  per-second grade will be ~0 and the fit will skew flat. Filter by sport
  type if it matters.
