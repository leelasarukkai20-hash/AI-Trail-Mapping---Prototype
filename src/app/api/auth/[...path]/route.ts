/**
 * Proxies all Neon Auth requests (sign-in, OTP verify, session, sign-out, etc.)
 * through this single catch-all route.
 */
import { auth } from "@/lib/auth/server";

export const { GET, POST } = auth.handler();
