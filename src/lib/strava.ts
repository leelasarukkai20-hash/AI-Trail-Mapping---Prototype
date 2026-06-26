// Strava OAuth + API helpers.
//
// Docs: https://developers.strava.com/docs/authentication/
//
// This module intentionally keeps zero external dependencies so it runs on
// Vercel serverless / edge without extra setup. Token persistence is stubbed
// with a signed cookie for the scaffold (see lib/session.ts); swap that for
// Postgres before the real pilot — see TODO markers.

const STRAVA_OAUTH_AUTHORIZE = "https://www.strava.com/oauth/authorize";
const STRAVA_OAUTH_TOKEN = "https://www.strava.com/oauth/token";
const STRAVA_API = "https://www.strava.com/api/v3";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function redirectUri(): string {
  // Must EXACTLY match the "Authorization Callback Domain" registered in the
  // Strava app settings (domain only, no scheme/path there).
  return `${env("APP_BASE_URL")}/api/strava/callback`;
}

/** Build the URL we send the user to so they can grant access. */
export function buildAuthorizeUrl(state: string): string {
  const scopes = process.env.STRAVA_SCOPES || "activity:read_all,profile:read_all";
  const params = new URLSearchParams({
    client_id: env("STRAVA_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    approval_prompt: "auto", // "force" to always show the consent screen
    scope: scopes,
    state,
  });
  return `${STRAVA_OAUTH_AUTHORIZE}?${params.toString()}`;
}

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete?: StravaAthlete;
  // Granted OAuth scopes (e.g. "activity:read_all,profile:read_all"). Comes
  // from the callback URL `scope` param, not the token-exchange response.
  scope?: string;
}

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile?: string;
  city?: string;
  state?: string;
}

/** Exchange the one-time authorization code for tokens. */
export async function exchangeCodeForTokens(code: string): Promise<StravaTokens> {
  const res = await fetch(STRAVA_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env("STRAVA_CLIENT_ID"),
      client_secret: env("STRAVA_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Strava token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at,
    athlete: json.athlete,
  };
}

/** Refresh an expired access token. Strava access tokens last ~6 hours. */
export async function refreshTokens(refreshToken: string): Promise<StravaTokens> {
  const res = await fetch(STRAVA_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env("STRAVA_CLIENT_ID"),
      client_secret: env("STRAVA_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at,
  };
}

/**
 * Return a valid access token, refreshing if it expires within 5 minutes.
 * Returns the (possibly updated) token set so the caller can persist it.
 */
export async function getFreshTokens(tokens: StravaTokens): Promise<StravaTokens> {
  const skewSeconds = 300;
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at - skewSeconds > now) return tokens;
  const refreshed = await refreshTokens(tokens.refresh_token);
  return { ...tokens, ...refreshed };
}

/**
 * Fetch the current athlete (used by `/api/strava/me` to display the name).
 * We re-fetch instead of caching because Strava only returns the athlete on
 * the initial code exchange, not on refresh, and the user may rename on Strava.
 */
export async function getAthlete(accessToken: string): Promise<StravaAthlete> {
  const res = await fetch(`${STRAVA_API}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.status === 429) throw new RateLimitError("Strava rate limit hit (429). Back off and retry.");
  if (!res.ok) throw new Error(`Strava athlete fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Pull recent activities. Used to fit the per-user pace-on-grade model. */
export async function getActivities(
  accessToken: string,
  opts: { afterEpoch?: number; perPage?: number; page?: number } = {}
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({
    per_page: String(opts.perPage ?? 100),
    page: String(opts.page ?? 1),
  });
  if (opts.afterEpoch) params.set("after", String(opts.afterEpoch));

  const res = await fetch(`${STRAVA_API}/athlete/activities?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.status === 429) {
    throw new RateLimitError("Strava rate limit hit (429). Back off and retry.");
  }
  if (!res.ok) {
    throw new Error(`Strava activities failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Last 90 days of runs, paginated. Filters to running activities only. */
export async function getRecentRuns(accessToken: string): Promise<StravaActivity[]> {
  const after = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
  const all: StravaActivity[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await getActivities(accessToken, { afterEpoch: after, perPage: 100, page });
    all.push(...batch);
    if (batch.length < 100) break; // last page
  }
  return all.filter((a) => a.type === "Run" || a.sport_type === "TrailRun" || a.sport_type === "Run");
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  distance: number; // meters
  moving_time: number; // seconds
  total_elevation_gain: number; // meters
  start_date: string; // ISO
  average_speed?: number; // m/s
}

export class RateLimitError extends Error {}
