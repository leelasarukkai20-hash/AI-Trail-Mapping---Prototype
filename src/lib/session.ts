// Lightweight signed-cookie session for the SCAFFOLD ONLY.
//
// It stores the Strava token set in an httpOnly, signed cookie so the OAuth
// flow is testable end-to-end before the database exists.
//
// TODO (before pilot): replace this with Postgres. Store tokens server-side
// keyed by user id, and keep only a session id in the cookie. Cookies have a
// ~4KB limit and you do NOT want refresh tokens living in the browser long-term.

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import type { StravaTokens } from "./strava";

const COOKIE_NAME = "mt_strava";
const STATE_COOKIE = "mt_oauth_state";

function secret(): string {
  const s = process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error("Missing OAUTH_STATE_SECRET");
  return s;
}

function sign(payload: string): string {
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verify(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return payload;
}

const secureCookie = process.env.NODE_ENV === "production";

export async function saveTokens(tokens: StravaTokens): Promise<void> {
  const payload = Buffer.from(JSON.stringify(tokens)).toString("base64url");
  (await cookies()).set(COOKIE_NAME, sign(payload), {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function loadTokens(): Promise<StravaTokens | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const payload = verify(raw);
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

// --- CSRF state for the authorize round-trip ---

export async function setOAuthState(state: string): Promise<void> {
  (await cookies()).set(STATE_COOKIE, sign(state), {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });
}

export async function consumeOAuthState(returned: string | null): Promise<boolean> {
  const jar = await cookies();
  const raw = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!raw || !returned) return false;
  const payload = verify(raw);
  return payload !== null && payload === returned;
}
