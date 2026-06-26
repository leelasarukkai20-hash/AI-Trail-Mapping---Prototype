import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthorizeUrl } from "@/lib/strava";
import { setOAuthState } from "@/lib/session";

// GET /api/strava/authorize -> redirect the user to Strava's consent screen.
export async function GET() {
  const state = randomBytes(16).toString("hex");
  await setOAuthState(state);
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
