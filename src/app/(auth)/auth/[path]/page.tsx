/**
 * Renders Neon Auth's prebuilt sign-in / OTP screens at /auth/* (e.g.
 * /auth/sign-in). The AuthView component handles the email -> one-time-code flow.
 */
import { AuthView } from "@neondatabase/auth-ui";

export default async function AuthPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-3 p-4 md:p-6">
      <AuthView path={path} />
    </main>
  );
}
