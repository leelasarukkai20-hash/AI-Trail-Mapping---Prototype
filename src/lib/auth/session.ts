/**
 * Server-side session helpers — thin wrappers over `auth.getSession()`.
 *
 * The auth instance lives in `./server.ts`. This file gives feature code a
 * tiny, consistent surface so every place that needs "who is the current user"
 * uses the same call.
 *
 * Usage:
 *   - Server Components / pages: `requireUserPage()` (redirects to sign-in if unauth)
 *   - Route handlers / Server Actions: `requireUserApi()` (returns a 401 Response if unauth)
 *   - Anywhere "user-if-present" is OK: `getCurrentUser()` (returns null if unauth)
 *
 * Every Server Component that reads the session must export `dynamic = 'force-dynamic'`
 * (Neon Auth caches the session in a signed cookie with a per-request signature).
 */
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "./server";

export type SessionUser = { id: string; email: string };

export async function getCurrentUser(): Promise<SessionUser | null> {
  const { data } = await auth.getSession();
  const user = data?.user;
  if (!user) return null;
  return { id: user.id, email: user.email };
}

/**
 * Use from Server Components / pages. Redirects unauthenticated requests to
 * the sign-in screen. Returns the user when authenticated.
 *
 * Throws (via `redirect`) and never returns on the unauth path, so callers can
 * treat the return as non-null.
 */
export async function requireUserPage(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  return user;
}

/**
 * Use from API route handlers. Returns either the user or a 401 NextResponse —
 * the caller checks the discriminant and short-circuits on unauth.
 *
 *   const result = await requireUserApi();
 *   if (!result.ok) return result.response;
 *   const { user } = result;
 */
export type RequireUserApiResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

export async function requireUserApi(): Promise<RequireUserApiResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, user };
}
