"use client";

import { useState } from "react";

export default function InviteForm({ email }: { email: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/invite/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Try again.");
        return;
      }
      // Full navigation (not router.push) so the server re-reads invite state.
      window.location.assign("/?invite=redeemed");
    } catch {
      setError("Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={redeem}>
      <p className="muted" style={{ marginTop: 0 }}>
        Signed in as {email}
      </p>
      <label htmlFor="invite-code">Invite code</label>
      <input
        id="invite-code"
        className="text-input"
        type="text"
        autoComplete="off"
        autoCapitalize="none"
        placeholder="e.g. foggy-ridge-42"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {error && <div className="banner err" style={{ marginTop: 12 }}>{error}</div>}
      <div style={{ height: 12 }} />
      <button className="btn-primary" type="submit" disabled={code.trim().length === 0 || submitting}>
        {submitting ? "Checking…" : "Redeem invite"}
      </button>
    </form>
  );
}
