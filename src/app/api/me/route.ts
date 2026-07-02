import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isInvited } from "@/lib/auth/invites";
import { getSelfReportedPace } from "@/lib/runner-profile";

export const dynamic = "force-dynamic";

// GET /api/me -> auth + invite state for the client UI.
//   { user: null, invited: false, self_pace_min_per_km: null }   signed out
//   { user: { email }, invited: false, ... }                     signed in, no code redeemed
//   { user: { email }, invited: true, self_pace_min_per_km }     provisioned pilot user
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null, invited: false, self_pace_min_per_km: null });
  const [invited, selfPace] = await Promise.all([isInvited(user.id), getSelfReportedPace(user.id)]);
  return NextResponse.json({
    user: { email: user.email },
    invited,
    self_pace_min_per_km: selfPace,
  });
}
