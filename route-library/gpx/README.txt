Drop your exported GPX files in this folder, then run:  npm run scaffold

Each <name>.gpx becomes a draft routes/<name>.geojson with distance, gain,
shape, elevation, trailhead coords, a region guess, and a first-pass difficulty
already filled in. You then add the local-knowledge fields (name, vibe_tags,
surface %, parking, founder_notes) and run:  npm run ingest

Where GPX comes from:
- A route builder with snap-to-trail (Caltopo, Gaia, or Strava) — draw and export.
- A recorded run — export the GPX from your watch or Strava.

If a track has no elevation, set a MAPBOX_TOKEN environment variable before
running scaffold and it will backfill elevation from Mapbox.
