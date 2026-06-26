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
  },
});
