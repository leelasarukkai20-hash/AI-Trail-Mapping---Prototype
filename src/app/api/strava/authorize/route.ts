import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthorizeUrl } from "@/lib/strava";
import { setOAuthState } from "@/lib/oauth-state";
import { getCurrentUser } from "@/lib/auth/session";
import { isInvited } from "@/lib/auth/invites";

// GET /api/strava/authorize -> redirect the user to Strava's consent screen.
//
// Requires sign-in (tokens are stored per user) AND a redeemed invite code —
// Strava connect is a provisioned-pilot action. `redirectTo` brings the user
// back here after the sign-in screen so the connect flow resumes.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?redirectTo=/api/strava/authorize", req.url)
    );
  }
  if (!(await isInvited(user.id))) {
    return NextResponse.redirect(new URL("/onboarding/invite", req.url));
  }
  const state = randomBytes(16).toString("hex");
  await setOAuthState(state);
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
