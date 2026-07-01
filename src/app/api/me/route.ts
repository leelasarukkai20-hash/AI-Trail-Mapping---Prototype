import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isInvited } from "@/lib/auth/invites";

export const dynamic = "force-dynamic";

// GET /api/me -> auth + invite state for the client UI.
//   { user: null, invited: false }                      signed out
//   { user: { email }, invited: false }                 signed in, no code redeemed
//   { user: { email }, invited: true }                  provisioned pilot user
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null, invited: false });
  return NextResponse.json({
    user: { email: user.email },
    invited: await isInvited(user.id),
  });
}
