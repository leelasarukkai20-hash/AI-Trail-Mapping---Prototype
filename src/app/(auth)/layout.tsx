"use client";
/**
 * Layout for the /auth route group. Loads the scoped Tailwind/Neon-Auth-UI styles
 * and wraps the auth pages in NeonAuthUIProvider with passwordless email OTP
 * enabled. Lives here (not the root layout) so the rest of the app is untouched.
 */
import "./auth-tailwind.css";
import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import { authClient } from "@/lib/auth/client";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <NeonAuthUIProvider authClient={authClient} emailOTP>
      {children}
    </NeonAuthUIProvider>
  );
}
