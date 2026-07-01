import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { isInvited } from "@/lib/auth/invites";
import InviteForm from "./InviteForm";

// Reads the session, so it must be dynamic.
export const dynamic = "force-dynamic";

// Post-sign-in gate: anyone can authenticate (managed Neon Auth), but only
// invited runners get provisioned. Signed-in-but-unprovisioned users land
// here; redeeming a code unlocks Strava connect and the rest of the pilot.
export default async function InvitePage() {
  const user = await requireUserPage();
  if (await isInvited(user.id)) redirect("/");
  return (
    <main>
      <h1>You’re almost in</h1>
      <p className="sub">
        The Marin pilot is invite-only for now. Enter the invite code from your
        welcome message to unlock personalization.
      </p>
      <InviteForm email={user.email} />
    </main>
  );
}
