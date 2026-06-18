# Vert Route Library — getting started (R1 & R2)

This folder is a working starter kit for the first two Curated Route Library tasks:

- **R1 — Define the route metadata GeoJSON schema** → `schema/route.schema.json` (+ `types/route.ts`)
- **R2 — Build the ingest/validate workflow** → `ingest.ts`

It also includes a **scaffold** (`scaffold.ts`) that turns GPX files into draft routes, so building all 50 is mostly filling in blanks rather than authoring from scratch. There's one fully filled-in sample route in `routes/` so you can see the shape of a "done" route and copy it.

```
route-library/
├─ schema/route.schema.json   ← the rulebook: what a valid route looks like
├─ types/route.ts             ← the same shape as a TypeScript type (for app code)
├─ gpx/                        ← drop exported GPX files here (input to the scaffold)
├─ routes/                    ← one .geojson file per route (your content lives here)
│  └─ tennessee-valley-coastal-loop.geojson
├─ scaffold.ts                ← GPX → draft .geojson (pre-fills everything derivable)
├─ ingest.ts                  ← loads + validates every route, derives distance/gain
└─ package.json
```

## What "a route" actually is

Each route is one **GeoJSON Feature** — a standard, boring, widely-supported format that mapping tools already understand. A Feature has two parts:

- **`geometry`** — the line on the map. For a route this is always a `LineString`: an ordered list of points. Each point is `[longitude, latitude, elevation]`. **Longitude comes first** — that's the GeoJSON convention and the single most common mistake. Elevation is in meters.
- **`properties`** — everything else: name, distance, climb, difficulty, surface mix, vibe tags, trailhead, your founder notes.

So "designing the schema" (R1) just means writing down, precisely, which properties every route must have and what counts as a valid value for each. That's what `schema/route.schema.json` is.

## How the schema defines a route

`route.schema.json` is written in **JSON Schema** — a standard language for describing the shape of JSON data. Every field has a plain-English `description` you can read top to bottom. The parts worth understanding:

- **`required`** lists the fields a route *must* have. `additionalProperties: false` means typos like `dificulty` get rejected instead of silently ignored.
- **Controlled vocabularies** (`enum`) lock certain fields to a fixed set of values — `difficulty` is one of `easy / moderate / hard / very-hard`, `vibe_tags` come from a fixed list, etc. This matters more than it looks: **your tags are the matching signal**, so "ocean-views" vs "ocean view" vs "coastal" being three different strings is exactly how recommendations go bad. The enum forces consistency. When you genuinely need a new tag, you add it to the enum on purpose — a deliberate decision, not a free-text accident.
- **Ranges** catch nonsense — a latitude over 90, a negative distance, surface percentages above 100.

To extend the schema later, open the file and add a field under `properties` (and add it to `required` if it's mandatory), then mirror it in `types/route.ts`. The TS type is what gives you autocomplete and type-checking when you load routes elsewhere in the app; the JSON Schema is what does the actual validation.

## The fast path: scaffold from GPX (recommended for building all 50)

The route line is the expensive part; almost everything else is either computed from it or a quick human pass. The scaffold does the computing for you.

1. **Get a GPX per route.** Draw each route in a builder with snap-to-trail (Caltopo, Gaia, or Strava) and export GPX, or export a recorded run from your watch/Strava. Don't pull from AllTrails or similar — their terms prohibit it.
2. **Drop the files in `gpx/`** and run:
   ```bash
   npm install         # first time only
   npm run scaffold    # gpx/*.gpx  →  routes/<id>.geojson drafts
   ```
   Each draft arrives with `distance_km`, `gain_m`, `shape`, elevation, trailhead coords, a region guess, and a first-pass `difficulty` already filled in. The editable fields sit at the top of the file. Re-running never overwrites a route you've already edited.

   *Elevation:* most GPX already include it, so usually there's nothing to do. If a track lacks elevation, the scaffold backfills it from Mapbox — open the `.env` file and paste your Mapbox public token after `MAPBOX_TOKEN=` (the file is gitignored, so the token stays off git). The per-route output line tells you the source: `from GPX`, `from Mapbox`, or a note if it's missing.
3. **Fill the blanks per route:** `vibe_tags`, real `surface` percentages, `parking`, `founder_notes` — and confirm the auto-filled `name` (a Title Case version of the id, e.g. `matt-davis-loop` → "Matt Davis Loop"), `difficulty`, and `shape`. The judgment fields are stubbed with `TODO` so you can see what's left. Easiest way to do this across many routes is the spreadsheet workflow below.
4. **Validate:** `npm run ingest`. A fresh draft deliberately fails until you add at least one vibe tag and real surface numbers — those two most affect match quality, so the validator won't let them slide.

## Filling in metadata: the spreadsheet workflow (recommended for many routes)

Editing dozens of `.geojson` files by hand is tedious and easy to get wrong. Instead, edit them all as rows in one spreadsheet:

1. **Export:** `npm run export` writes `routes-metadata.xlsx` — one row per route. Columns from the GPX (id, distance, gain, trailhead lat/lon) are greyed out; the fields you fill in have dropdowns wherever there's a fixed list (region, shape, difficulty, parking), pulled straight from the schema so they can't drift. A **Guide** tab lists every allowed value, including the `vibe_tags` vocabulary.
2. **Fill it in.** Open the file (Excel shows the dropdowns best; Google Sheets works too), and fill the blank columns. `vibe_tags` is comma-separated — copy from the Guide tab. You and Leela can edit different rows in parallel.
3. **Apply:** `npm run apply` reads the sheet and writes your values back into each `routes/<id>.geojson`. The geometry is never touched, and distance/gain/trailhead are recomputed from it.
4. **Validate:** `npm run ingest` until everything's `✓`.

Re-running `npm run export` rebuilds the sheet from the current files, so it always reflects what's saved — a quick way to see which routes still have blanks. The whole loop is safe to repeat as you and Leela chip away at the list.

## Route status: draft vs active

Every route has a `status`: `draft` (still being worked on — not shown to users) or `active` (vetted and OK to recommend). New scaffolded routes start as `draft`, and it's a dropdown column in the spreadsheet, so you promote a route to `active` deliberately once you've checked it. This is *editorial* state only — whether a physical trail is currently open/closed is a separate concern handled by the closures system at recommendation time, never stored here.

`npm run ingest` prints a `by status` count so you can see how many are ready. (There's also a one-time `npm run migrate-status` that stamps `draft` on any older route file missing the field — already run on the initial library.)

## The manual workflow (one route, no GPX)

You can also author a route by hand:

1. **Make the track.** Trace or record the route and convert it to a GeoJSON `LineString`. *(The sample's coordinates are an illustrative placeholder — real routes should use a real track.)*
2. **Fill in the properties.** Copy `tennessee-valley-coastal-loop.geojson`, rename it (`routes/<your-id>.geojson`), and edit the values. For `distance_km` and `gain_m`, just put your best guess — the next step checks them for you.
3. **Run the validator:**
   ```bash
   npm install        # first time only
   npm run ingest     # validates every route in routes/
   ```
4. **Read the output and fix.** For each route you'll get one of:
   - `✓` — valid, and the distance/climb you typed match the geometry.
   - `⚠` — valid, but a number looks off (e.g. *"distance_km says 4.2 but geometry implies 3.04 km"*). Correct your number to match the track and rerun.
   - `✗` — invalid. It prints exactly what's wrong (`region must be equal to one of the allowed values`, `id must match pattern…`). Fix and rerun.

   The script exits with an error code if *any* route is invalid, so later you can make it a gate that blocks a deploy until the whole library is clean.

That loop — **type a guess → run ingest → correct to match** — is the whole R2 workflow. The script derives distance with the haversine formula over the geometry and elevation gain by summing every uphill step, so it independently checks your metadata against the actual track and catches a bad GPX or a typo before it ever reaches a runner.

## What the ingest script gives the rest of the app

When run, it loads every valid route into one in-memory array (`loaded`) — that's the route library the LLM/ranking layer (L-series tasks) will score against. Right now it prints a summary; when you wire it into the app you'd export `loaded` instead.

## Suggested next steps toward R3 (15 anchor routes)

1. Settle the schema: skim `route.schema.json`, and if a field is missing for how *you* think about routes, add it now while there's only one route to update.
2. Pick your 15 classics across Mt Tam, the Headlands, and Tennessee Valley.
3. For each: get a GPX → `npm run scaffold` → fill the local-knowledge blanks → `npm run ingest` until it's `✓`.
4. Keep tagging discipline tight — that consistency is what R6 (the QA pass) later checks, and it's the difference between good and bad matches.
