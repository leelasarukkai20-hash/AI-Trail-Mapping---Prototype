"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Route } from "../../route-library/types/route";
import type { Intent } from "@/lib/intent";

// Lazy-load the map so Mapbox (~490kB) only ships when a user expands a result.
const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <div className="route-map" style={{ height: "260px", background: "#121922" }} />,
});

interface MeResponse {
  connected: boolean;
  athlete?: { name: string } | null;
  runs?: { last90Days: number; totalMiles: number };
  error?: string;
}

interface ScoredRouteResponse {
  route: Route;
  score: number;
  rationale: string;
  estimated_minutes: number | null;
}

interface RecommendResponse {
  intent: Intent;
  top: ScoredRouteResponse | null;
  alternates: ScoredRouteResponse[];
  avg_pace_min_per_km: number | null;
}

const BANNERS: Record<string, { kind: string; text: string }> = {
  connected: { kind: "ok", text: "Strava connected. We'll personalize your pace estimates." },
  denied: { kind: "warn", text: "Strava connection cancelled. You can still browse routes." },
  bad_state: { kind: "err", text: "Security check failed. Please try connecting again." },
  missing_scope: { kind: "err", text: "We need activity access to personalize. Please re-connect and allow it." },
  error: { kind: "err", text: "Something went wrong connecting to Strava. Try again." },
};

const SAMPLE_PROMPTS = [
  "12 mi climby",
  "easy 5 mi w/ dog",
  "flat redwoods near Mill Valley",
  "summit run with ocean views",
];

export default function Home() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [prompt, setPrompt] = useState("");
  const [banner, setBanner] = useState<{ kind: string; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("strava");
    if (s && BANNERS[s]) setBanner(BANNERS[s]);
    if (s) window.history.replaceState({}, "", "/");

    fetch("/api/strava/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ connected: false }));
  }, []);

  async function disconnect() {
    await fetch("/api/strava/disconnect", { method: "POST" });
    setMe({ connected: false });
  }

  async function findRoute(promptOverride?: string) {
    const p = (promptOverride ?? prompt).trim();
    if (!p) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setExpandedId(null);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Recommendation failed");
        return;
      }
      setResults(json);
      // Auto-expand the top match.
      if (json.top) setExpandedId(json.top.route.properties.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const connected = me?.connected === true;
  const showSamples = !loading && !results && prompt.trim().length === 0;

  return (
    <main>
      <h1>Where do you want to run?</h1>
      <p className="sub">Curated Marin trail routes, matched to your prompt and personalized to your Strava.</p>

      {banner && <div className={`banner ${banner.kind}`}>{banner.text}</div>}

      <div className="card">
        <label htmlFor="prompt">Describe your run</label>
        <textarea
          id="prompt"
          placeholder="e.g. 12 miles, lots of climbing, mostly singletrack, ocean views"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        {showSamples && (
          <div className="sample-chips">
            {SAMPLE_PROMPTS.map((s) => (
              <button key={s} type="button" className="sample-chip" onClick={() => { setPrompt(s); findRoute(s); }}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div style={{ height: 12 }} />
        <button
          className="btn-primary"
          disabled={prompt.trim().length === 0 || loading}
          onClick={() => findRoute()}
        >
          {loading ? "Finding…" : "Find my route"}
        </button>
      </div>

      {error && <div className="banner err">{error}</div>}
      {loading && <SkeletonResults />}
      {results && (
        <Results
          data={results}
          expandedId={expandedId}
          onToggle={(id) => setExpandedId((prev) => (prev === id ? null : id))}
        />
      )}

      <div className="card">
        {me === null ? (
          <p className="muted">Checking Strava…</p>
        ) : connected ? (
          <div className="athlete">
            <div>
              <div className="status ok">✓ Strava connected{me.athlete ? ` — ${me.athlete.name}` : ""}</div>
              {me.runs && (
                <div className="muted" style={{ marginTop: 4 }}>
                  {me.runs.last90Days} runs · {me.runs.totalMiles} mi in the last 90 days
                </div>
              )}
              {me.error && <div className="status err" style={{ marginTop: 4 }}>Couldn’t load activity right now.</div>}
            </div>
            <button className="btn-ghost" onClick={disconnect}>Disconnect</button>
          </div>
        ) : (
          <div>
            <div className="status warn" style={{ marginBottom: 12 }}>
              Connect Strava for personalized pace and “you’ve run this before” signals.
            </div>
            <a className="btn-strava" href="/api/strava/authorize">
              <StravaMark /> Connect with Strava
            </a>
          </div>
        )}
      </div>

      <p className="muted" style={{ textAlign: "center", marginTop: 24 }}>
        Always verify trail conditions yourself before heading out.
      </p>
    </main>
  );
}

function Results({
  data,
  expandedId,
  onToggle,
}: {
  data: RecommendResponse;
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  const chips = intentChips(data.intent);
  return (
    <>
      {chips.length > 0 && (
        <div className="intent-chips">
          {chips.map((c) => <span key={c} className="intent-chip">{c}</span>)}
        </div>
      )}
      {data.top ? (
        <>
          <div className="results-header">Top match</div>
          <ResultCard r={data.top} top expanded={expandedId === data.top.route.properties.id} onToggle={onToggle} />
          {data.alternates.length > 0 && (
            <>
              <div className="results-header">Alternates</div>
              {data.alternates.map((alt) => (
                <ResultCard
                  key={alt.route.properties.id}
                  r={alt}
                  expanded={expandedId === alt.route.properties.id}
                  onToggle={onToggle}
                />
              ))}
            </>
          )}
        </>
      ) : (
        <div className="card"><p className="muted">No routes matched. Try a broader prompt.</p></div>
      )}
    </>
  );
}

function ResultCard({
  r,
  top,
  expanded,
  onToggle,
}: {
  r: ScoredRouteResponse;
  top?: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  const p = r.route.properties;
  const miles = (p.distance_km * 0.621371).toFixed(1);
  const feet = Math.round(p.gain_m * 3.281);
  return (
    <div className={`result-card${top ? " top" : ""}${expanded ? " expanded" : ""}`}>
      <button
        type="button"
        className="result-summary"
        aria-expanded={expanded}
        onClick={() => onToggle(p.id)}
      >
        <h3 className="result-name">{p.name}</h3>
        <div className="result-stats">{miles} mi · {feet} ft gain · {p.region} · {p.difficulty}</div>
        <div className="result-rationale">{r.rationale}</div>
        {r.estimated_minutes != null && !expanded && (
          <div className="result-eta">~{r.estimated_minutes} min at your recent pace</div>
        )}
      </button>
      {expanded && <ResultDetail r={r} />}
    </div>
  );
}

function ResultDetail({ r }: { r: ScoredRouteResponse }) {
  const p = r.route.properties;
  const miles = (p.distance_km * 0.621371).toFixed(1);
  const feet = Math.round(p.gain_m * 3.281);
  const km = p.distance_km.toFixed(1);
  const m = p.gain_m;
  return (
    <div className="result-detail">
      <RouteMap route={r.route} />

      <div className="hero-stats">
        <div><div className="hero-num">{miles}</div><div className="hero-unit">mi <span className="muted">({km} km)</span></div></div>
        <div><div className="hero-num">{feet}</div><div className="hero-unit">ft gain <span className="muted">({m} m)</span></div></div>
        <div>
          <div className="hero-num">{r.estimated_minutes != null ? r.estimated_minutes : "—"}</div>
          <div className="hero-unit">min<span className="muted">{r.estimated_minutes != null ? " (your pace)" : ""}</span></div>
        </div>
      </div>

      <SurfaceBar surface={p.surface} />

      {p.vibe_tags.length > 0 && (
        <div className="vibe-chips">
          {p.vibe_tags.map((t) => <span key={t} className="vibe-chip">{t}</span>)}
        </div>
      )}

      <div className="trailhead-block">
        <div className="trailhead-row">
          <div>
            <div className="trailhead-name">📍 {p.trailhead.name}</div>
            <div className="muted">{p.trailhead.parking} parking{p.trailhead.notes ? ` · ${p.trailhead.notes}` : ""}</div>
          </div>
          <a className="btn-ghost map-link" href={mapsLink(p.trailhead.lat, p.trailhead.lon, p.trailhead.name)} target="_blank" rel="noreferrer">
            Open in Maps
          </a>
        </div>
      </div>

      {p.founder_notes && <p className="founder-notes">{p.founder_notes}</p>}

      <a className="gpx-link" href={`/api/routes/${p.id}/gpx`}>↓ Download GPX</a>
    </div>
  );
}

function SurfaceBar({ surface }: { surface: { trail_pct: number; fire_road_pct: number; road_pct: number } }) {
  const total = surface.trail_pct + surface.fire_road_pct + surface.road_pct || 1;
  const segs = [
    { pct: surface.trail_pct, color: "#4ea1ff", label: "trail" },
    { pct: surface.fire_road_pct, color: "#ffcf6e", label: "fire road" },
    { pct: surface.road_pct, color: "#93a1b0", label: "road" },
  ];
  return (
    <div>
      <div className="surface-bar">
        {segs.map((s) => (
          s.pct > 0 ? <div key={s.label} style={{ width: `${(s.pct / total) * 100}%`, background: s.color }} /> : null
        ))}
      </div>
      <div className="surface-legend">
        {segs.filter((s) => s.pct > 0).map((s) => (
          <span key={s.label}><span className="dot" style={{ background: s.color }} /> {s.pct}% {s.label}</span>
        ))}
      </div>
    </div>
  );
}

function SkeletonResults() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-line w-70" />
          <div className="skeleton-line w-50" />
          <div className="skeleton-line w-90" />
        </div>
      ))}
    </>
  );
}

function mapsLink(lat: number, lon: number, label: string): string {
  // Apple Maps on iOS handles maps:// gracefully; Google Maps URL works everywhere as a fallback.
  if (typeof window !== "undefined" && /iPhone|iPad|iPod/i.test(window.navigator.userAgent)) {
    return `https://maps.apple.com/?q=${encodeURIComponent(label)}&ll=${lat},${lon}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

function intentChips(intent: Intent): string[] {
  const chips: string[] = [];
  if (intent.distance_km != null) chips.push(`~${(intent.distance_km * 0.621371).toFixed(1)} mi`);
  if (intent.min_gain_m != null) chips.push(`>${Math.round(intent.min_gain_m * 3.281)} ft gain`);
  if (intent.max_gain_m != null) chips.push(`<${Math.round(intent.max_gain_m * 3.281)} ft gain`);
  if (intent.surface_preference && intent.surface_preference !== "any") {
    chips.push(intent.surface_preference === "fire_road" ? "fire road" : intent.surface_preference);
  }
  if (intent.region) chips.push(intent.region);
  if (intent.difficulty) chips.push(intent.difficulty);
  if (intent.dogs_allowed) chips.push("dog-friendly");
  if (intent.vibe_tags) chips.push(...intent.vibe_tags);
  return chips;
}

function StravaMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}
