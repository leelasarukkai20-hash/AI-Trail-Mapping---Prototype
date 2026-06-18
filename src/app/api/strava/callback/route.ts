import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/strava";
import { consumeOAuthState, saveTokens } from "@/lib/session";

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

  if (!consumeOAuthState(state)) {
    return NextResponse.redirect(`${base}/?strava=bad_state`);
  }
  if (!code) {
    return NextResponse.redirect(`${base}/?strava=no_code`);
  }

  // Verify Strava granted the scopes we need. The granted scopes come back as
  // a comma-separated "scope" param.
  const granted = (searchParams.get("scope") || "").split(",");
  if (!granted.includes("activity:read_all")) {
    return NextResponse.redirect(`${base}/?strava=missing_scope`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    saveTokens(tokens);
    // TODO: persist tokens + athlete to Postgres, then kick off the 90-day
    // activity backfill (POST /api/strava/sync) to fit the pace-on-grade model.
    return NextResponse.redirect(`${base}/?strava=connected`);
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(`${base}/?strava=error`);
  }
}
