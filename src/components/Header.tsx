"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth/client";

/**
 * App chrome header. Lives in the root layout, so it renders on every page
 * except `/auth/*` (where it would just be visual noise on the sign-in screens).
 *
 * Session state comes from `authClient.useSession()` — a client-side reactive
 * hook — rather than from a server read, so the rest of the layout stays
 * static. The brief "no nav" gap during `isPending` is intentional: it's
 * better than a wrong-state flash.
 */
export default function Header() {
  const pathname = usePathname();
  // Skip on `/auth/*` (sign-in screens don't need a "Sign in" button) and on
  // `/curate` (internal editorial tool — its own full-bleed UI, no consumer
  // chrome).
  if (pathname?.startsWith("/auth/") || pathname?.startsWith("/curate")) return null;

  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  async function handleSignOut() {
    await authClient.signOut();
    // Reload so any server reads (Strava /me, future invite check, etc.) re-run
    // with no session and the body matches the header.
    location.reload();
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/" className="brand">Vert</Link>
        <nav className="app-nav">
          {isPending ? null : user ? (
            <>
              <span className="email muted" title={user.email}>{user.email}</span>
              <button type="button" className="btn-ghost btn-sm" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <Link href="/auth/sign-in" className="btn-ghost btn-sm">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
