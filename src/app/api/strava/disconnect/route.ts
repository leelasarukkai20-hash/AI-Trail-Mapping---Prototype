import { NextResponse } from "next/server";
import { loadStravaTokens, clearStravaTokens } from "@/lib/strava-store";
import { deauthorize, getFreshTokens } from "@/lib/strava";
import { requireUserApi } from "@/lib/auth/session";

// POST /api/strava/disconnect -> delete the caller's Strava tokens AND revoke
// the grant on Strava's side (so the app disappears from their Strava
// settings). Revocation is best-effort: if Strava is unreachable we still
// delete our copy — the user asked to disconnect, and an orphaned grant with
// no stored token can't be used by us anyway.
//
// Idempotent: deleting a non-existent row is a no-op. We still require auth so
// an unauthenticated caller can't probe the endpoint.
export async function POST() {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  const stored = await loadStravaTokens(auth.user.id);
  if (stored) {
    try {
      const tokens = await getFreshTokens(stored);
      await deauthorize(tokens.access_token);
    } catch (e) {
      console.error(`strava deauthorize failed for ${auth.user.id} (deleting tokens anyway):`, e);
    }
  }

  await clearStravaTokens(auth.user.id);
  return NextResponse.json({ ok: true });
}
