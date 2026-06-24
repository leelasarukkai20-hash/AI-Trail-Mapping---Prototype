// TypeScript mirror of route.schema.json.
// The JSON Schema is the source of truth for *validation* (the ingest script enforces it).
// This type is the source of truth for *your code* - it's what you get autocomplete and
// type-checking against when you load routes elsewhere in the app.
// Keep the two in sync: if you add a field to the schema, add it here too.

export type Region =
  | "Headlands"
  | "Mill Valley"
  | "Muir Beach"
  | "Stinson Beach"
  | "Other";

export type RouteShape = "loop" | "out-and-back" | "point-to-point";

// Editorial state — is this route ready to recommend? (Not the same as a physical closure.)
export type RouteStatus = "draft" | "active";

export type Difficulty = "easy" | "moderate" | "hard" | "very-hard";

export type Parking = "lot" | "street" | "limited" | "none";

export type VibeTag =
  | "shaded" | "exposed" | "ocean-views" | "ridgeline" | "summit"
  | "redwoods" | "creek" | "waterfall" | "wildflowers" 
  | "technical" | "smooth" | "steep-climb" | "gradual" | "rolling"
  | "beginner-friendly" | "quiet" | "popular" | "dog-friendly";

// GeoJSON position: [longitude, latitude, elevation_in_meters]. Longitude first.
export type Position = [number, number, number];

export interface RouteSurface {
  trail_pct: number;
  fire_road_pct: number;
  road_pct: number;
}

export interface Trailhead {
  name: string;
  lat: number;
  lon: number;
  parking: Parking;
  notes?: string;
}

export interface RouteProperties {
  id: string;
  name: string;
  status: RouteStatus;
  region: Region;
  shape: RouteShape;
  distance_km: number;
  gain_m: number;
  difficulty: Difficulty;
  surface: RouteSurface;
  vibe_tags: VibeTag[];
  trailhead: Trailhead;
  dogs_allowed?: boolean;
  water_on_route?: boolean;
  last_verified?: string; // YYYY-MM-DD
  founder_notes: string;
  strava_route_url?: string;
}

export interface RouteGeometry {
  type: "LineString";
  coordinates: Position[];
}

// One curated route = one GeoJSON Feature.
export interface Route {
  type: "Feature";
  geometry: RouteGeometry;
  properties: RouteProperties;
}
