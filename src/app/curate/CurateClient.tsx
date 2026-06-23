"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./curate.css";
import type {
  Route,
  RouteProperties,
  VibeTag,
  Region,
  RouteShape,
  RouteStatus,
  Difficulty,
  Parking,
} from "../../../route-library/types/route";

const REGIONS: Region[] = ["Headlands", "Mill Valley", "Muir Beach", "Stinson Beach", "Other"];
const SHAPES: RouteShape[] = ["loop", "out-and-back", "point-to-point"];
const STATUSES: RouteStatus[] = ["draft", "active"];
const DIFFICULTIES: Difficulty[] = ["easy", "moderate", "hard", "very-hard"];
const PARKINGS: Parking[] = ["lot", "street", "limited", "none"];
const VIBE_TAGS: VibeTag[] = [
  "shaded", "exposed", "ocean-views", "ridgeline", "summit",
  "redwoods", "creek", "waterfall", "wildflowers",
  "technical", "smooth", "steep-climb", "gradual", "rolling",
  "beginner-friendly", "quiet", "popular", "dog-friendly",
];

type ValidationProblem = { path: string; message: string };
type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "ok" } | { kind: "error"; problems: ValidationProblem[] };

export default function CurateClient({
  initialRoutes,
  mapboxToken,
}: {
  initialRoutes: Route[];
  mapboxToken: string;
}) {
  const [routes, setRoutes] = useState<Route[]>(initialRoutes);
  const [selectedId, setSelectedId] = useState<string | null>(initialRoutes[0]?.properties.id ?? null);
  const [filterRegion, setFilterRegion] = useState<"all" | Region>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | RouteStatus>("all");
  const [filterDifficulty, setFilterDifficulty] = useState<"all" | Difficulty>("all");
  const [search, setSearch] = useState("");

  // Editable form draft for the selected route
  const selectedRoute = routes.find((r) => r.properties.id === selectedId) ?? null;
  const [draft, setDraft] = useState<RouteProperties | null>(selectedRoute?.properties ?? null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  useEffect(() => {
    setDraft(selectedRoute?.properties ?? null);
    setSaveState({ kind: "idle" });
  }, [selectedId, selectedRoute]);

  const visible = useMemo(() => {
    return routes.filter((r) => {
      const p = r.properties;
      if (filterRegion !== "all" && p.region !== filterRegion) return false;
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterDifficulty !== "all" && p.difficulty !== filterDifficulty) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.id.includes(q)) return false;
      }
      return true;
    });
  }, [routes, filterRegion, filterStatus, filterDifficulty, search]);

  async function onSave() {
    if (!draft || !selectedId) return;
    setSaveState({ kind: "saving" });
    try {
      const res = await fetch(`/api/routes/${selectedId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ properties: draft }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveState({ kind: "error", problems: json.problems ?? [{ path: "", message: json.error ?? "save failed" }] });
        return;
      }
      setRoutes((prev) => prev.map((r) => (r.properties.id === selectedId ? json.route : r)));
      setSaveState({ kind: "ok" });
    } catch (e) {
      setSaveState({ kind: "error", problems: [{ path: "", message: (e as Error).message }] });
    }
  }

  const dirty = draft && selectedRoute && JSON.stringify(draft) !== JSON.stringify(selectedRoute.properties);

  return (
    <div className="curate">
      {/* Left: route list */}
      <aside className="curate-list">
        <header>
          <h1>Vert · Curate</h1>
          <div className="counts">
            {visible.length} of {routes.length} routes
          </div>
        </header>
        <div className="filters">
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="filter-row">
            <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value as "all" | Region)}>
              <option value="all">All regions</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "all" | RouteStatus)}>
              <option value="all">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value as "all" | Difficulty)}>
              <option value="all">All difficulties</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <ul>
          {visible.map((r) => {
            const p = r.properties;
            const isSelected = p.id === selectedId;
            return (
              <li key={p.id}>
                <button
                  className={`route-row ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  <div className="row-top">
                    <span className="row-name">{p.name}</span>
                    <span className={`pill pill-${p.status}`}>{p.status}</span>
                  </div>
                  <div className="row-meta">
                    {p.distance_km} km · {p.gain_m} m · {p.difficulty} · {p.region}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Right: map + editor */}
      <div className="curate-detail">
        {selectedRoute && draft ? (
          <RouteDetail
            route={selectedRoute}
            draft={draft}
            setDraft={setDraft}
            mapboxToken={mapboxToken}
            saveState={saveState}
            dirty={!!dirty}
            onSave={onSave}
            onRevert={() => {
              setDraft(selectedRoute.properties);
              setSaveState({ kind: "idle" });
            }}
          />
        ) : (
          <div className="empty">Select a route from the left to view it.</div>
        )}
      </div>
    </div>
  );
}

function RouteDetail({
  route,
  draft,
  setDraft,
  mapboxToken,
  saveState,
  dirty,
  onSave,
  onRevert,
}: {
  route: Route;
  draft: RouteProperties;
  setDraft: (p: RouteProperties) => void;
  mapboxToken: string;
  saveState: SaveState;
  dirty: boolean;
  onSave: () => void;
  onRevert: () => void;
}) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  // initialize map once
  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !mapboxToken) return;
    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-122.55, 37.9],
      zoom: 10,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxToken]);

  // redraw the route when it changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawRoute = () => {
      const SRC = "route-line";
      const LAYER = "route-line-layer";
      if (map.getLayer(LAYER)) map.removeLayer(LAYER);
      if (map.getSource(SRC)) map.removeSource(SRC);
      map.addSource(SRC, {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: route.geometry },
      });
      map.addLayer({
        id: LAYER,
        type: "line",
        source: SRC,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ff5722", "line-width": 4 },
      });

      // fit bounds
      const coords = route.geometry.coordinates;
      const bounds = coords.reduce(
        (b, c) => b.extend([c[0], c[1]]),
        new mapboxgl.LngLatBounds([coords[0][0], coords[0][1]], [coords[0][0], coords[0][1]])
      );
      map.fitBounds(bounds, { padding: 60, duration: 400 });

      // trailhead marker
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = new mapboxgl.Marker({ color: "#ff5722" })
        .setLngLat([route.properties.trailhead.lon, route.properties.trailhead.lat])
        .setPopup(new mapboxgl.Popup().setText(route.properties.trailhead.name))
        .addTo(map);
    };

    if (map.isStyleLoaded()) {
      drawRoute();
    } else {
      map.once("load", drawRoute);
    }
  }, [route]);

  if (!mapboxToken) {
    return (
      <div className="empty">
        <p><strong>Mapbox token missing.</strong></p>
        <p>Add <code>NEXT_PUBLIC_MAPBOX_TOKEN=…</code> to <code>.env.local</code> and restart <code>npm run dev</code>.</p>
      </div>
    );
  }

  const updateProps = (patch: Partial<RouteProperties>) => setDraft({ ...draft, ...patch });
  const updateSurface = (k: keyof RouteProperties["surface"], v: number) =>
    setDraft({ ...draft, surface: { ...draft.surface, [k]: v } });
  const updateTrailhead = (k: keyof RouteProperties["trailhead"], v: string) =>
    setDraft({ ...draft, trailhead: { ...draft.trailhead, [k]: v as never } });
  const toggleTag = (tag: VibeTag) => {
    const has = draft.vibe_tags.includes(tag);
    setDraft({
      ...draft,
      vibe_tags: has ? draft.vibe_tags.filter((t) => t !== tag) : [...draft.vibe_tags, tag],
    });
  };
  const surfaceSum = draft.surface.trail_pct + draft.surface.fire_road_pct + draft.surface.road_pct;

  return (
    <div className="detail">
      <div ref={mapContainer} className="map" />

      <div className="editor">
        <div className="editor-header">
          <div>
            <h2>{draft.name}</h2>
            <div className="muted">
              <code>{draft.id}</code> · {draft.distance_km} km · {draft.gain_m} m
              {dirty ? <span className="dirty"> · unsaved changes</span> : null}
            </div>
          </div>
          <div className="actions">
            {dirty && (
              <button className="btn-ghost" onClick={onRevert} disabled={saveState.kind === "saving"}>
                Revert
              </button>
            )}
            <button
              className="btn-primary"
              onClick={onSave}
              disabled={!dirty || saveState.kind === "saving"}
            >
              {saveState.kind === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {saveState.kind === "ok" && <div className="banner ok">Saved ✓ — schema valid.</div>}
        {saveState.kind === "error" && (
          <div className="banner err">
            <strong>Validation failed</strong>
            <ul>
              {saveState.problems.map((p, i) => (
                <li key={i}><code>{p.path}</code> {p.message}</li>
              ))}
            </ul>
          </div>
        )}

        <section className="grid">
          <Field label="Name">
            <input value={draft.name} onChange={(e) => updateProps({ name: e.target.value })} />
          </Field>
          <Field label="Status">
            <select value={draft.status} onChange={(e) => updateProps({ status: e.target.value as RouteStatus })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Region">
            <select value={draft.region} onChange={(e) => updateProps({ region: e.target.value as Region })}>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Shape">
            <select value={draft.shape} onChange={(e) => updateProps({ shape: e.target.value as RouteShape })}>
              {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Difficulty">
            <select value={draft.difficulty} onChange={(e) => updateProps({ difficulty: e.target.value as Difficulty })}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Last verified">
            <input
              type="date"
              value={draft.last_verified ?? ""}
              onChange={(e) => updateProps({ last_verified: e.target.value || undefined })}
            />
          </Field>
        </section>

        <section>
          <h3>Surface mix</h3>
          <div className="surface-row">
            <Field label="Trail %">
              <input type="number" min={0} max={100} value={draft.surface.trail_pct}
                onChange={(e) => updateSurface("trail_pct", parseInt(e.target.value, 10) || 0)} />
            </Field>
            <Field label="Fire road %">
              <input type="number" min={0} max={100} value={draft.surface.fire_road_pct}
                onChange={(e) => updateSurface("fire_road_pct", parseInt(e.target.value, 10) || 0)} />
            </Field>
            <Field label="Road %">
              <input type="number" min={0} max={100} value={draft.surface.road_pct}
                onChange={(e) => updateSurface("road_pct", parseInt(e.target.value, 10) || 0)} />
            </Field>
            <div className={`sum ${Math.abs(surfaceSum - 100) > 1 ? "warn" : "ok"}`}>
              sum: {surfaceSum}
            </div>
          </div>
        </section>

        <section>
          <h3>Vibe tags <span className="muted">({draft.vibe_tags.length} selected)</span></h3>
          <div className="chips">
            {VIBE_TAGS.map((t) => {
              const on = draft.vibe_tags.includes(t);
              return (
                <button key={t} className={`chip ${on ? "on" : ""}`} onClick={() => toggleTag(t)} type="button">
                  {t}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3>Trailhead</h3>
          <div className="grid">
            <Field label="Name">
              <input value={draft.trailhead.name} onChange={(e) => updateTrailhead("name", e.target.value)} />
            </Field>
            <Field label="Parking">
              <select value={draft.trailhead.parking} onChange={(e) => updateTrailhead("parking", e.target.value)}>
                {PARKINGS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label={`Lat (derived)`}>
              <input value={draft.trailhead.lat} disabled />
            </Field>
            <Field label={`Lon (derived)`}>
              <input value={draft.trailhead.lon} disabled />
            </Field>
          </div>
          <Field label="Trailhead notes">
            <textarea
              rows={2}
              value={draft.trailhead.notes ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setDraft({ ...draft, trailhead: { ...draft.trailhead, notes: v || undefined } as typeof draft.trailhead });
              }}
            />
          </Field>
        </section>

        <section>
          <h3>Conditions</h3>
          <div className="grid">
            <Field label="Dogs allowed">
              <select
                value={draft.dogs_allowed === undefined ? "unset" : String(draft.dogs_allowed)}
                onChange={(e) => {
                  const v = e.target.value;
                  updateProps({ dogs_allowed: v === "unset" ? undefined : v === "true" });
                }}
              >
                <option value="unset">— not set —</option>
                <option value="true">yes</option>
                <option value="false">no</option>
              </select>
            </Field>
            <Field label="Water on route">
              <select
                value={draft.water_on_route === undefined ? "unset" : String(draft.water_on_route)}
                onChange={(e) => {
                  const v = e.target.value;
                  updateProps({ water_on_route: v === "unset" ? undefined : v === "true" });
                }}
              >
                <option value="unset">— not set —</option>
                <option value="true">yes</option>
                <option value="false">no</option>
              </select>
            </Field>
          </div>
        </section>

        <section>
          <h3>Founder notes</h3>
          <textarea
            rows={5}
            value={draft.founder_notes}
            onChange={(e) => updateProps({ founder_notes: e.target.value })}
          />
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
