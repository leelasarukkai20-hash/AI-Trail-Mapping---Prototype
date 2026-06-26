/**
 * Signed-cookie CSRF state for the Strava OAuth round-trip.
 *
 * This file used to also hold the Strava token set (signed-cookie scaffold);
 * those have moved to the `strava_tokens` table — see `src/lib/strava-store.ts`.
 * What's left here is genuinely cookie-shaped: a short-lived nonce that travels
 * with the user-agent through Strava's consent screen and is verified on
 * callback. The cookie never holds long-lived credentials.
 */
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

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
