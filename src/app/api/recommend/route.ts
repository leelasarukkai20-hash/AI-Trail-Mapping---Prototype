import { NextResponse } from "next/server";
import { listRoutes } from "@/lib/routes";
import { parseIntent, withDerivedDistance, type Intent } from "@/lib/intent";
import { rankRoutes, matchConfidence, type ScoredRoute, type MatchConfidence } from "@/lib/ranker";
import { estimateMovingTimeMinutes } from "@/lib/pace";
import { getStravaSummary } from "@/lib/strava-stats";
import { getSelfReportedPace } from "@/lib/runner-profile";
import { getCurrentUser } from "@/lib/auth/session";
import { db, schema } from "@/lib/db/client";

export const dynamic = "force-dynamic";

type RecommendedRoute = ScoredRoute & { estimated_minutes: number | null };

type PaceSource = "strava" | "self_reported" | null;

async function getEffectivePace(
  userId: string | null
): Promise<{ pace: number | null; source: PaceSource }> {
  // Pace chain: Strava cache (12 h TTL, lib/strava-stats.ts) -> self-reported
  // easy pace (cold start, lib/runner-profile.ts) -> none. Strava always wins
  // once connected. Logged-out callers still get recommendations, just without
  // a personal pace.
  if (!userId) return { pace: null, source: null };
  try {
    const summary = await getStravaSummary(userId);
    if (summary?.avgPaceMinPerKm != null) {
      return { pace: summary.avgPaceMinPerKm, source: "strava" };
    }
    const selfPace = await getSelfReportedPace(userId);
    if (selfPace != null) return { pace: selfPace, source: "self_reported" };
    return { pace: null, source: null };
  } catch {
    return { pace: null, source: null };
  }
}

/**
 * Persist what was asked and what we answered (the pilot's measurement data:
 * feedback thumbs reference the recommendation row, and predicted_minutes is
 * the "predicted" half of predicted-vs-actual). Best-effort by design — a
 * logging failure must never break the recommendation itself.
 *
 * Anonymous usage is logged with user_id null: what logged-out visitors ask
 * for (and whether we could answer) is exactly the demand signal the pilot
 * wants, and a prompt is not personal data tied to an identity.
 */
async function logRecommendation(args: {
  userId: string | null;
  promptText: string;
  intent: Intent;
  top: RecommendedRoute | null;
  alternates: RecommendedRoute[];
  confidence: MatchConfidence | null;
}): Promise<string | null> {
  try {
    const [promptRow] = await db
      .insert(schema.prompts)
      .values({ userId: args.userId, text: args.promptText })
      .returning({ id: schema.prompts.id });
    const [rec] = await db
      .insert(schema.recommendations)
      .values({
        promptId: promptRow.id,
        userId: args.userId,
        intent: args.intent,
        topRouteId: args.top?.route.properties.id ?? null,
        alternateRouteIds: args.alternates.map((a) => a.route.properties.id),
        confidence: args.confidence,
        predictedMinutes: args.top?.estimated_minutes ?? null,
      })
      .returning({ id: schema.recommendations.id });
    return rec.id;
  } catch (e) {
    console.error("recommendation logging failed:", e);
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

  const user = await getCurrentUser();
  const userId = user?.id ?? null;
  const [parsed, { pace: avgPace, source: paceSource }] = await Promise.all([
    parseIntent(prompt),
    getEffectivePace(userId),
  ]);

  // Out-of-coverage: don't force a Marin route on an out-of-area request.
  if (parsed.out_of_coverage) {
    // Logged too: out-of-area asks tell us where demand is.
    const recommendationId = await logRecommendation({
      userId, promptText: prompt, intent: parsed, top: null, alternates: [], confidence: null,
    });
    return NextResponse.json({
      intent: parsed,
      top: null,
      alternates: [],
      out_of_coverage: true,
      message: "We only cover Marin County trails right now.",
      avg_pace_min_per_km: avgPace,
      pace_source: paceSource,
      recommendation_id: recommendationId,
    });
  }

  // Turn a time budget into a distance when no distance was given.
  const intent = withDerivedDistance(parsed, avgPace);

  const ranked = rankRoutes(listRoutes(), intent);
  if (ranked.length === 0) {
    const recommendationId = await logRecommendation({
      userId, promptText: prompt, intent, top: null, alternates: [], confidence: null,
    });
    return NextResponse.json({
      intent, top: null, alternates: [], avg_pace_min_per_km: avgPace,
      pace_source: paceSource,
      recommendation_id: recommendationId,
    });
  }

  const withPace: RecommendedRoute[] = ranked.slice(0, 3).map((r) => ({
    ...r,
    estimated_minutes: estimateMovingTimeMinutes(r.route, avgPace),
  }));

  const confidence = matchConfidence(ranked[0].score, intent);
  const recommendationId = await logRecommendation({
    userId, promptText: prompt, intent,
    top: withPace[0], alternates: withPace.slice(1), confidence,
  });

  return NextResponse.json({
    intent,
    top: withPace[0],
    alternates: withPace.slice(1),
    confidence,
    avg_pace_min_per_km: avgPace,
    pace_source: paceSource,
    recommendation_id: recommendationId,
  });
}
