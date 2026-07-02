import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { isInvited } from "@/lib/auth/invites";
import { isValidPace, saveSelfReportedPace } from "@/lib/runner-profile";

// POST /api/profile/pace { pace_min_per_km: number }
//
// Saves the user's self-reported easy/flat pace (cold-start personalization
// for no-Strava users). Invited users only — same gate as Strava connect:
// unprovisioned accounts don't get persisted writes.
export async function POST(req: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;
  if (!(await isInvited(auth.user.id))) {
    return NextResponse.json({ error: "invite required" }, { status: 403 });
  }

  let body: { pace_min_per_km?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const pace = body.pace_min_per_km;
  if (!isValidPace(pace)) {
    return NextResponse.json(
      { error: "pace_min_per_km must be a number between 2.5 and 15" },
      { status: 400 }
    );
  }

  await saveSelfReportedPace(auth.user.id, pace);
  return NextResponse.json({ ok: true, pace_min_per_km: pace });
}
