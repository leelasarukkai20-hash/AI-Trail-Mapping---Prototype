import { NextResponse } from "next/server";
import { listRoutes } from "@/lib/routes";
import { parseIntent } from "@/lib/intent";
import { rankRoutes, type ScoredRoute } from "@/lib/ranker";
import { avgPaceFromRuns, estimateMovingTimeMinutes } from "@/lib/pace";
import { loadTokens, saveTokens } from "@/lib/session";
import { getFreshTokens, getRecentRuns } from "@/lib/strava";

export const dynamic = "force-dynamic";

type RecommendedRoute = ScoredRoute & { estimated_minutes: number | null };

async function getUserAvgPace(): Promise<number | null> {
  const stored = loadTokens();
  if (!stored) return null;
  try {
    const tokens = await getFreshTokens(stored);
    if (tokens.access_token !== stored.access_token) saveTokens(tokens);
    const runs = await getRecentRuns(tokens.access_token);
    return avgPaceFromRuns(runs);
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

  const [intent, avgPace] = await Promise.all([parseIntent(prompt), getUserAvgPace()]);

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
    avg_pace_min_per_km: avgPace,
  });
}
