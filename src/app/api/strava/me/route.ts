import { NextResponse } from "next/server";
import { loadStravaTokens } from "@/lib/strava-store";
import { getStravaSummary } from "@/lib/strava-stats";
import { getCurrentUser } from "@/lib/auth/session";

// GET /api/strava/me -> connection status + the cached 90-day summary.
//
// Returns `{ connected: false }` when:
//   - the caller isn't signed in (so no per-user tokens exist), or
//   - the caller is signed in but hasn't connected Strava yet.
// Either way the homepage shows the "Connect with Strava" button.
//
// Rate-limit safety: this used to do a live athlete + 90-day pull on every
// homepage load. It now reads the cached summary (12 h TTL, refreshed by
// lib/strava-stats.ts) and only reports an error when there's no cache at
// all to serve (e.g. first load after connect while Strava is down).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ connected: false });

  const stored = await loadStravaTokens(user.id);
  if (!stored) return NextResponse.json({ connected: false });

  const summary = await getStravaSummary(user.id);
  if (!summary) {
    // Connected, but the first refresh failed — nothing cached to show.
    return NextResponse.json({ connected: true, error: "strava_fetch_failed" }, { status: 502 });
  }

  return NextResponse.json({
    connected: true,
    athlete: { name: summary.athleteName ?? "" },
    runs: {
      last90Days: summary.runsLast90,
      totalMiles: summary.milesLast90,
    },
  });
}
