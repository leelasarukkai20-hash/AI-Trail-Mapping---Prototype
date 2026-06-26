import { NextResponse } from "next/server";
import { clearStravaTokens } from "@/lib/strava-store";
import { requireUserApi } from "@/lib/auth/session";

// POST /api/strava/disconnect -> delete the caller's Strava tokens.
//
// Idempotent: deleting a non-existent row is a no-op. We still require auth so
// an unauthenticated caller can't probe the endpoint.
// TODO (pilot): also call POST https://www.strava.com/oauth/deauthorize so
// Strava revokes the grant on their side too.
export async function POST() {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;
  await clearStravaTokens(auth.user.id);
  return NextResponse.json({ ok: true });
}
