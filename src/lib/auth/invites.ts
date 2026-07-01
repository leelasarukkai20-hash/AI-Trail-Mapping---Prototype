/**
 * Invite-code gating (WI-4).
 *
 * Neon Auth is a managed service, so we can't reject sign-ups with a Better
 * Auth hook — anyone can authenticate. The gate is enforced here, in the app,
 * after sign-in: a user is "invited" (provisioned) once they've redeemed a
 * single-use code from the `invite_codes` table. Gated actions (Strava
 * connect, any future persisted writes) check `isInvited()` first.
 *
 * Codes are seeded with `npm run db:seed-invites` (scripts/seed-invites.ts).
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client";

/** Has this user redeemed an invite code? The same gate proxy.ts will rely on when the wall is armed. */
export async function isInvited(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ code: schema.inviteCodes.code })
    .from(schema.inviteCodes)
    .where(eq(schema.inviteCodes.usedByUserId, userId))
    .limit(1);
  return row !== undefined;
}

export type RedeemResult = { ok: true } | { ok: false; error: "invalid_or_used" };

/**
 * Redeem a single-use invite code for a user.
 *
 * Race-safe: a conditional UPDATE claims the code only if it's still unused,
 * so two concurrent attempts on the same code can't both succeed (no
 * read-then-write). Idempotent for a user who is already provisioned — a
 * double submit or a second code still resolves to { ok: true }.
 */
export async function redeemInviteCode(userId: string, rawCode: string): Promise<RedeemResult> {
  const code = rawCode.trim().toLowerCase();
  if (!code) return { ok: false, error: "invalid_or_used" };

  const claimed = await db
    .update(schema.inviteCodes)
    .set({ usedByUserId: userId, usedAt: new Date() })
    .where(and(eq(schema.inviteCodes.code, code), isNull(schema.inviteCodes.usedByUserId)))
    .returning({ code: schema.inviteCodes.code });
  if (claimed.length > 0) return { ok: true };

  // 0 rows: unknown code, or already claimed. If this user is already
  // provisioned (double submit, or a second valid code), treat it as success.
  if (await isInvited(userId)) return { ok: true };
  return { ok: false, error: "invalid_or_used" };
}
