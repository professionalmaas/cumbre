"use client";

import { useState } from "react";

// Opens the Stripe Billing Portal (update card, view invoices, cancel). POSTs to the portal
// route, which resolves the user's customer id and returns a one-time portal URL.
export function ManageBillingButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setBusy(false);
        return setError(data.error ?? "Could not open billing.");
      }
      window.location.href = data.url;
    } catch {
      setBusy(false);
      setError("Could not open billing.");
    }
  }

  return (
    <span>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        style={{
          background: "transparent",
          border: "1px solid var(--line-strong)",
          color: "var(--muted)",
          borderRadius: 999,
          padding: "7px 14px",
          fontSize: 12,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Opening…" : "Manage billing"}
      </button>
      {error && <span style={{ color: "#f87272", fontSize: 12, marginLeft: 10 }}>{error}</span>}
    </span>
  );
}
