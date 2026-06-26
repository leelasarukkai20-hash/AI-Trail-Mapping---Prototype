"use client";
/**
 * Neon Auth (Better Auth) — browser client. Used by the Neon Auth UI components
 * (NeonAuthUIProvider) and any client-side auth hooks.
 */
import { createAuthClient } from "@neondatabase/auth/next";

export const authClient = createAuthClient();
