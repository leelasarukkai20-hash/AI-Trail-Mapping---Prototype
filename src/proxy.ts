/**
 * Route protection (WI-6). Next 16 renamed `middleware.ts` to `proxy.ts` —
 * this is the same edge middleware, under the new filename.
 *
 * Session-cookie check only — no DB calls at the edge. The invite gate
 * (`isInvited`) runs in server code, not here.
 *
 * THE WALL IS INTENTIONALLY DISARMED: `/` stays public so anonymous visitors
 * can run prompt -> recommendation (founders' decision). Only paths that make
 * no sense logged-out are matched.
 */
import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/auth/sign-in" });

export const config = {
  matcher: [
    "/onboarding/:path*",
    // ---- ARM THE FULL LOGIN WALL AT LAUNCH ----
    // To require sign-in for the whole app, replace the matcher above with the
    // single pattern below (it exempts the auth screens, auth API, Strava
    // OAuth callback, Next internals, and static files):
    // "/((?!auth|api/auth|api/strava/callback|_next|favicon\\.ico|.*\\..*).*)",
  ],
};
