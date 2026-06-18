"use client";

import { useEffect, useState } from "react";

interface MeResponse {
  connected: boolean;
  athlete?: { name: string } | null;
  runs?: { last90Days: number; totalMiles: number };
  error?: string;
}

const BANNERS: Record<string, { kind: string; text: string }> = {
  connected: { kind: "ok", text: "Strava connected. We'll personalize your pace estimates." },
  denied: { kind: "warn", text: "Strava connection cancelled. You can still browse routes." },
  bad_state: { kind: "err", text: "Security check failed. Please try connecting again." },
  missing_scope: { kind: "err", text: "We need activity access to personalize. Please re-connect and allow it." },
  error: { kind: "err", text: "Something went wrong connecting to Strava. Try again." },
};

export default function Home() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [prompt, setPrompt] = useState("");
  const [banner, setBanner] = useState<{ kind: string; text: string } | null>(null);

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

  const connected = me?.connected === true;

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
        <div style={{ height: 12 }} />
        <button className="btn-primary" disabled={prompt.trim().length === 0} onClick={() => alert("Route matching is the LLM layer — wired up next.")}>
          Find my route
        </button>
      </div>

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

function StravaMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}
