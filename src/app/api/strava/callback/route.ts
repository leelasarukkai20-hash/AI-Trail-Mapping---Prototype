import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/strava";
import { consumeOAuthState } from "@/lib/oauth-state";
import { saveStravaTokens } from "@/lib/strava-store";
import { getCurrentUser } from "@/lib/auth/session";

// GET /api/strava/callback?code=...&state=...&scope=...
// Strava redirects here after the user grants (or denies) access.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const base = process.env.APP_BASE_URL || "";

  const error = searchParams.get("error");
  if (error) {
    // User clicked "Cancel" on Strava's consent screen.
    return NextResponse.redirect(`${base}/?strava=denied`);
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!(await consumeOAuthState(state))) {
    return NextResponse.redirect(`${base}/?strava=bad_state`);
  }
  if (!code) {
    return NextResponse.redirect(`${base}/?strava=no_code`);
  }

  // Defensive: the session that started /authorize should still be valid here,
  // but Strava's round-trip can take a minute. If it expired, send back to
  // sign-in rather than orphaning the tokens.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${base}/auth/sign-in`);
  }

  // Verify Strava granted the scopes we need. The granted scopes come back as
  // a comma-separated "scope" param.
  const grantedRaw = searchParams.get("scope") || "";
  const granted = grantedRaw.split(",");
  if (!granted.includes("activity:read_all")) {
    return NextResponse.redirect(`${base}/?strava=missing_scope`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveStravaTokens(user.id, { ...tokens, scope: grantedRaw });
    return NextResponse.redirect(`${base}/?strava=connected`);
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(`${base}/?strava=error`);
  }
}
