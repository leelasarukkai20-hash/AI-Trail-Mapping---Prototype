import { NextResponse } from "next/server";
import { getAthlete, getFreshTokens, getRecentRuns } from "@/lib/strava";
import { loadStravaTokens, saveStravaTokens } from "@/lib/strava-store";
import { getCurrentUser } from "@/lib/auth/session";

// GET /api/strava/me -> connection status + a quick proof the token works.
//
// Returns `{ connected: false }` when:
//   - the caller isn't signed in (so no per-user tokens exist), or
//   - the caller is signed in but hasn't connected Strava yet.
// Either way the homepage shows the "Connect with Strava" button.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ connected: false });

  const stored = await loadStravaTokens(user.id);
  if (!stored) return NextResponse.json({ connected: false });

  try {
    const tokens = await getFreshTokens(stored);
    if (tokens.access_token !== stored.access_token) {
      // Refresh path: persist the rotated token. Athlete object is absent on
      // refresh — saveStravaTokens preserves the existing athlete_id.
      await saveStravaTokens(user.id, tokens);
    }

    const [athlete, runs] = await Promise.all([
      getAthlete(tokens.access_token),
      getRecentRuns(tokens.access_token),
    ]);
    const totalMeters = runs.reduce((s, r) => s + r.distance, 0);

    return NextResponse.json({
      connected: true,
      athlete: { name: `${athlete.firstname} ${athlete.lastname}`.trim() },
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
