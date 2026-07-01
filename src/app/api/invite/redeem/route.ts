import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { redeemInviteCode } from "@/lib/auth/invites";

export const dynamic = "force-dynamic";

// POST /api/invite/redeem { code } -> provision the signed-in user.
//
// 401 when not signed in; 422 for an unknown/already-used code. Success is
// idempotent for an already-provisioned user (see redeemInviteCode).
export async function POST(req: Request) {
  const auth = await requireUserApi();
  if (!auth.ok) return auth.response;

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.code?.trim()) {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }

  const result = await redeemInviteCode(auth.user.id, body.code);
  if (!result.ok) {
    return NextResponse.json(
      { error: "That code isn’t valid or has already been used." },
      { status: 422 }
    );
  }
  return NextResponse.json({ ok: true });
}
