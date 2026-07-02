"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";

const PLANS = [
  {
    id: "summit",
    label: "Summit Pass",
    price: "$9",
    sub: "one-time",
    bullets: ["0–100 summit score", "Music + Lyrics grades", "Top 3 fixes", "Energy map + mix report"],
    cta: "Continue — pay $9 once",
    popular: false,
  },
  {
    id: "season",
    label: "Season Pass",
    price: "$19",
    sub: "/ month",
    bullets: ["Unlimited reports", "Re-score after your fixes", "Track your climb over time", "Cancel anytime"],
    cta: "Continue — subscribe $19/mo",
    popular: true,
  },
];

// Public Stripe Payment Link URLs (NEXT_PUBLIC_*, not secrets) + the current user's
// sub/email, passed in from the server `plans/page.tsx`.
export interface PlansClientProps {
  paymentLinks?: { summit?: string; season?: string };
  userSub?: string;
  userEmail?: string | null;
  /** Pre-select a plan (the public /plans page carries the choice through Cognito state). */
  initialSelected?: "summit" | "season";
}

export function PlansClient({ paymentLinks, userSub, userEmail, initialSelected }: PlansClientProps = {}) {
  const [selected, setSelected] = useState<string>(initialSelected ?? "season");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    setError("");
    setBusy(true);
    track("checkout_start", { plan: selected });

    // Preferred path: redirect to the owner's hosted Stripe Payment Link, carrying the
    // user id as client_reference_id (the webhook keys entitlement off it) + prefilled
    // email. We only fall back to the Checkout-Sessions API route if no link is set.
    const link = paymentLinks?.[selected as "summit" | "season"];
    if (link) {
      const u = new URL(link);
      if (userSub) u.searchParams.set("client_reference_id", userSub);
      if (userEmail) u.searchParams.set("prefilled_email", userEmail);
      window.location.href = u.toString();
      return;
    }

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: selected }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setBusy(false);
        return setError(data.error ?? "Checkout failed.");
      }
      window.location.href = data.url;
    } catch {
      setBusy(false);
      setError("Checkout failed.");
    }
  }

  const current = PLANS.find((p) => p.id === selected)!;

  return (
    <div>
      <div style={{ display: "grid", gap: 12 }}>
        {PLANS.map((p) => {
          const on = selected === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className="card"
              style={{
                textAlign: "left",
                padding: "18px 20px",
                cursor: "pointer",
                position: "relative",
                background: on ? "var(--warm)" : "var(--card)",
                boxShadow: on ? "inset 0 0 0 1.5px #f6c64a" : "none",
                color: "var(--ink)",
              }}
            >
              {p.popular && (
                <span
                  style={{
                    position: "absolute",
                    top: -9,
                    right: 16,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: 1,
                    color: "#1a1205",
                    background: "var(--grad)",
                    borderRadius: 999,
                    padding: "3px 9px",
                    fontWeight: 700,
                  }}
                >
                  MOST POPULAR
                </span>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span className="serif" style={{ fontSize: 20 }}>
                  {p.label}
                </span>
                <span>
                  <b style={{ fontSize: 22 }}>{p.price}</b>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}> {p.sub}</span>
                </span>
              </div>
              <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {p.bullets.map((b) => (
                  <li key={b} style={{ color: "var(--muted)", fontSize: 13.5, display: "flex", gap: 8 }}>
                    <span style={{ color: "var(--gold)" }}>▲</span> {b}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {error && <p style={{ color: "#f87272", fontSize: 13, marginTop: 12 }}>{error}</p>}

      <button className="btn-primary" onClick={pay} disabled={busy} style={{ marginTop: 16 }}>
        {busy ? "Redirecting to Stripe…" : current.cta}
      </button>
    </div>
  );
}
