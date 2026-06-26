/*
 * DRAFT terms of use — a starting template, NOT legal advice.
 * Founders: review and adapt (especially the liability and governing-law clauses
 * for your jurisdiction) and ideally have it looked over before the public pilot.
 * Fill in EFFECTIVE_DATE and CONTACT_EMAIL below.
 */
export const metadata = { title: "Terms of Use — Marin Trails" };

const EFFECTIVE_DATE = "[DATE]";
const CONTACT_EMAIL = "[your@email.com]";

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.25rem", lineHeight: 1.6 }}>
      <h1>Terms of Use</h1>
      <p><em>Last updated: {EFFECTIVE_DATE}</em></p>

      <p>By using Marin Trails (the &ldquo;Service&rdquo;), an invite-only pilot, you agree to these terms.</p>

      <h2>Trail safety — please read</h2>
      <p>
        <strong>Trail running carries real risks, and you are responsible for your own safety.</strong>{" "}
        Routes, distances, elevation, surface, conditions, and trail closures shown in the app may be
        inaccurate, incomplete, or out of date. Always check current trail and weather conditions and
        official park alerts yourself, run within your ability, carry what you need, and turn back when
        conditions warrant. The Service is general information only and is not a substitute for your own
        judgment. By using it, you assume all risks of trail use.
      </p>

      <h2>Not medical or professional advice</h2>
      <p>
        Pace estimates and recommendations are informational only — not medical, fitness, or professional
        advice. Consult a professional before starting or changing any exercise program.
      </p>

      <h2>The Service</h2>
      <p>
        Marin Trails recommends curated Marin trail-running routes from a natural-language prompt, with
        optional Strava-based pace estimates. It is an early pilot and may change, break, or be discontinued.
      </p>

      <h2>Your account</h2>
      <p>Keep your access secure and use the Service only for lawful, personal use. Do not misuse, scrape, or attempt to disrupt it.</p>

      <h2>Third-party services</h2>
      <p>
        Your use of Strava is also governed by Strava&rsquo;s terms. Map data is provided by Mapbox and
        OpenStreetMap. You are responsible for complying with their terms and with all park, trail, and
        land-manager rules.
      </p>

      <h2>No warranty</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of
        any kind, including as to accuracy, fitness for a particular purpose, or availability.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, we are not liable for any injury, loss, or damages arising
        from your use of the Service or from trail use, conditions, or closures.{" "}
        <span style={{ color: "#888" }}>[Founders: have counsel tailor this clause and add a governing-law section.]</span>
      </p>

      <h2>Changes</h2>
      <p>We may update these terms; continued use means you accept the changes.</p>

      <h2>Contact</h2>
      <p>{CONTACT_EMAIL}.</p>
    </main>
  );
}
