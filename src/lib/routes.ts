import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import type { Route, RouteProperties } from "../../route-library/types/route";

const ROUTE_LIB = join(process.cwd(), "route-library");
const ROUTES_DIR = join(ROUTE_LIB, "routes");
const SCHEMA_PATH = join(ROUTE_LIB, "schema", "route.schema.json");

const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(schema);

export function getRouteSchema(): unknown {
  return schema;
}

function readRouteFile(id: string): Route {
  const path = join(ROUTES_DIR, `${id}.geojson`);
  return JSON.parse(readFileSync(path, "utf8")) as Route;
}

export function listRoutes(): Route[] {
  return readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith(".geojson"))
    .map((f) => JSON.parse(readFileSync(join(ROUTES_DIR, f), "utf8")) as Route)
    .sort((a, b) => a.properties.name.localeCompare(b.properties.name));
}

export function getRoute(id: string): Route | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) return null;
  try {
    return readRouteFile(id);
  } catch {
    return null;
  }
}

export type ValidationProblem = { path: string; message: string };

export function saveRoute(
  id: string,
  nextProps: RouteProperties
): { ok: true; route: Route } | { ok: false; problems: ValidationProblem[] } {
  const existing = getRoute(id);
  if (!existing) {
    return { ok: false, problems: [{ path: "id", message: `no route with id '${id}'` }] };
  }
  if (nextProps.id !== id) {
    return { ok: false, problems: [{ path: "id", message: "id cannot be changed" }] };
  }

  const next: Route = {
    type: "Feature",
    properties: nextProps,
    geometry: existing.geometry,
  };

  if (!validate(next)) {
    return {
      ok: false,
      problems: (validate.errors ?? []).map((e) => ({
        path: e.instancePath || "(root)",
        message: e.message ?? "invalid",
      })),
    };
  }

  const s = nextProps.surface;
  if (Math.abs(s.trail_pct + s.fire_road_pct + s.road_pct - 100) > 1) {
    return {
      ok: false,
      problems: [{ path: "/properties/surface", message: "trail+fire_road+road must sum to ~100" }],
    };
  }

  const json = JSON.stringify(next, null, 2).replace(
    /\[\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*\]/g,
    "[$1, $2, $3]"
  );
  writeFileSync(join(ROUTES_DIR, `${id}.geojson`), json + "\n");
  return { ok: true, route: next };
}
