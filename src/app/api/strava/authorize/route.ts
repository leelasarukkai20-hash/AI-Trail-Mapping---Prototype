import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthorizeUrl } from "@/lib/strava";
import { setOAuthState } from "@/lib/oauth-state";
import { getCurrentUser } from "@/lib/auth/session";

// GET /api/strava/authorize -> redirect the user to Strava's consent screen.
//
// Requires sign-in: Strava tokens are stored per user, so unauthenticated
// callers can't end up with a usable record. Send them to sign-in first.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    const base = process.env.APP_BASE_URL || "";
    return NextResponse.redirect(`${base}/auth/sign-in`);
  }
  const state = randomBytes(16).toString("hex");
  await setOAuthState(state);
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
