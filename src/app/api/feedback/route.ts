import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";

// POST /api/feedback -> record a thumbs verdict on a recommended route.
//
// The two booleans are deliberately separate signals (FE6):
//   good_match — did the recommendation fit what they asked for? (engine quality)
//   good_route — was the route itself any good? (library quality)
// A click sends one of them; each click is its own row and analysis takes the
// latest per (recommendation, route, question).
//
// Anonymous feedback is accepted (logged-out visitors can get recommendations,
// so they can rate them); user_id is attached when signed in. The
// recommendation_id must reference a real recommendation row — that ties every
// verdict to the exact intent + ranking that produced it.
export async function POST(req: Request) {
  let body: {
    recommendation_id?: string;
    route_id?: string;
    good_match?: boolean;
    good_route?: boolean;
    comment?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const recommendationId = typeof body.recommendation_id === "string" ? body.recommendation_id : null;
  const routeId = typeof body.route_id === "string" ? body.route_id : null;
  const goodMatch = typeof body.good_match === "boolean" ? body.good_match : null;
  const goodRoute = typeof body.good_route === "boolean" ? body.good_route : null;
  const comment =
    typeof body.comment === "string" && body.comment.trim()
      ? body.comment.trim().slice(0, 2000)
      : null;

  if (!recommendationId || !routeId) {
    return NextResponse.json({ error: "recommendation_id and route_id required" }, { status: 400 });
  }
  if (goodMatch == null && goodRoute == null && comment == null) {
    return NextResponse.json({ error: "nothing to record" }, { status: 400 });
  }

  const user = await getCurrentUser();

  try {
    await db.insert(schema.feedback).values({
      recommendationId,
      userId: user?.id ?? null,
      routeId,
      goodMatch,
      goodRoute,
      comment,
    });
  } catch (e) {
    // Bad uuid or a recommendation_id that doesn't exist (FK violation).
    console.error("feedback insert failed:", e);
    return NextResponse.json({ error: "unknown recommendation" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
