import { NextResponse } from "next/server";
import { listRoutes } from "@/lib/routes";
import { parseIntent, withDerivedDistance } from "@/lib/intent";
import { rankRoutes, matchConfidence, type ScoredRoute } from "@/lib/ranker";
import { estimateMovingTimeMinutes } from "@/lib/pace";
import { getStravaSummary } from "@/lib/strava-stats";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type RecommendedRoute = ScoredRoute & { estimated_minutes: number | null };

async function getUserAvgPace(): Promise<number | null> {
  // Pace personalization is only available to signed-in users with Strava
  // connected. Logged-out callers still get recommendations, just without
  // a personal pace. Reads the cached 90-day summary (12 h TTL) instead of
  // pulling from Strava on every prompt — see lib/strava-stats.ts.
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const summary = await getStravaSummary(user.id);
    return summary?.avgPaceMinPerKm ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const prompt = body.prompt?.trim();
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  const [parsed, avgPace] = await Promise.all([parseIntent(prompt), getUserAvgPace()]);

  // Out-of-coverage: don't force a Marin route on an out-of-area request.
  if (parsed.out_of_coverage) {
    return NextResponse.json({
      intent: parsed,
      top: null,
      alternates: [],
      out_of_coverage: true,
      message: "We only cover Marin County trails right now.",
      avg_pace_min_per_km: avgPace,
    });
  }

  // Turn a time budget into a distance when no distance was given.
  const intent = withDerivedDistance(parsed, avgPace);

  const ranked = rankRoutes(listRoutes(), intent);
  if (ranked.length === 0) {
    return NextResponse.json({ intent, top: null, alternates: [], avg_pace_min_per_km: avgPace });
  }

  const withPace: RecommendedRoute[] = ranked.slice(0, 3).map((r) => ({
    ...r,
    estimated_minutes: estimateMovingTimeMinutes(r.route, avgPace),
  }));

  return NextResponse.json({
    intent,
    top: withPace[0],
    alternates: withPace.slice(1),
    confidence: matchConfidence(ranked[0].score, intent),
    avg_pace_min_per_km: avgPace,
  });
}
