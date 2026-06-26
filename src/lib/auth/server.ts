/**
 * Neon Auth (Better Auth) — server instance.
 * Provides `.handler()` (API routes), `.middleware()` (route protection), and
 * `.getSession()` / Better Auth server methods. Reads NEON_AUTH_BASE_URL and
 * NEON_AUTH_COOKIE_SECRET from the environment.
 */
import { createNeonAuth } from "@neondatabase/auth/next/server";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
    // `lax` (not the default `strict`) so the auth cookie is sent on the
    // top-level redirect back from third-party OAuth providers (Strava, etc.).
    // With `strict`, /api/strava/callback can't see the session and the
    // OAuth round-trip ends at sign-in instead of writing the tokens.
    sameSite: "lax",
  },
});
