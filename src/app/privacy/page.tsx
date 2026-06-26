/*
 * DRAFT privacy policy — a starting template, NOT legal advice.
 * Founders: review and adapt it to your actual data practices, retention, and
 * jurisdiction, and ideally have it looked over before the public pilot.
 * Fill in EFFECTIVE_DATE and CONTACT_EMAIL below.
 */
export const metadata = { title: "Privacy Policy — Marin Trails" };

const EFFECTIVE_DATE = "[DATE]";
const CONTACT_EMAIL = "[your@email.com]";

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.25rem", lineHeight: 1.6 }}>
      <h1>Privacy Policy</h1>
      <p><em>Last updated: {EFFECTIVE_DATE}</em></p>

      <p>
        Marin Trails (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a small, invite-only pilot that recommends
        trail-running routes in Marin County. This policy explains what we collect, why, and your choices.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your email</strong> — to sign you in and contact you about the pilot.</li>
        <li><strong>Strava data</strong> (only if you connect Strava): your recent activities
          (distance, time, elevation, pace) and basic profile, used to personalize pace estimates.
          We request read-only access.</li>
        <li><strong>Your prompts and feedback</strong> — the run requests you type and the ratings
          you give, used to improve recommendations.</li>
        <li>Basic technical and usage data needed to run and secure the service.</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To provide and improve the recommendations, personalize pace estimates from your Strava
        history, and operate and secure the pilot. We do not sell your data, and we do not show ads.
      </p>

      <h2>Service providers</h2>
      <p>
        We share data only with providers that help us operate, under their terms: Strava (the
        activity data you connect), Anthropic (processes your prompt text to understand your request),
        Mapbox (maps), and Vercel, Neon, and Resend (hosting, database, and email). We do not sell or
        share your data for advertising.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        You can disconnect Strava at any time, which revokes our access and deletes the Strava data we
        stored for you. You can request deletion of your account and associated data by emailing{" "}
        {CONTACT_EMAIL}. We keep data only as long as needed for the pilot.
      </p>

      <h2>Security</h2>
      <p>
        We store your data in a managed database and take reasonable measures to protect it, but no
        system is perfectly secure.
      </p>

      <h2>Your choices</h2>
      <p>You can disconnect Strava, stop using the app, or request deletion at any time.</p>

      <h2>Contact</h2>
      <p>Questions or requests: {CONTACT_EMAIL}.</p>
    </main>
  );
}
