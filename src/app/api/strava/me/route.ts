import { NextResponse } from "next/server";
import { getFreshTokens, getRecentRuns } from "@/lib/strava";
import { loadTokens, saveTokens } from "@/lib/session";

// GET /api/strava/me -> connection status + a quick proof the token works.
// Returns the athlete and a summary of the last 90 days of runs.
export async function GET() {
  const stored = loadTokens();
  if (!stored) return NextResponse.json({ connected: false });

  try {
    const tokens = await getFreshTokens(stored);
    if (tokens.access_token !== stored.access_token) saveTokens(tokens);

    const runs = await getRecentRuns(tokens.access_token);
    const totalMeters = runs.reduce((s, r) => s + r.distance, 0);

    return NextResponse.json({
      connected: true,
      athlete: tokens.athlete
        ? { name: `${tokens.athlete.firstname} ${tokens.athlete.lastname}`.trim() }
        : null,
      runs: {
        last90Days: runs.length,
        totalMiles: Math.round((totalMeters / 1609.34) * 10) / 10,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ connected: true, error: "strava_fetch_failed" }, { status: 502 });
  }
}
