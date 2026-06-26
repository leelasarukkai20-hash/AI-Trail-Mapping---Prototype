import { NextResponse } from "next/server";
import { clearTokens } from "@/lib/session";

// POST /api/strava/disconnect -> clear the local session.
// TODO (pilot): also call POST https://www.strava.com/oauth/deauthorize with
// the access token so Strava revokes the grant on their side, and delete the
// user's tokens from Postgres.
export async function POST() {
  await clearTokens();
  return NextResponse.json({ ok: true });
}
