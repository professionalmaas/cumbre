"use client";

import { useState, useTransition } from "react";
import { startMagicLink } from "@/lib/actions/magicLink";

// Primary sign-in path: one email field, no password to invent. Cognito CUSTOM_AUTH under
// the hood (web/lib/actions/magicLink.ts) — this component only drives the UI state machine.
export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await startMagicLink(email);
      if (res.ok) {
        setState("sent");
      } else {
        setState("error");
        setError(res.error);
      }
    });
  }

  if (state === "sent") {
    return (
      <div style={{ textAlign: "center", padding: "6px 0" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✉️</div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Check your email</div>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
          We sent a sign-in link to <strong>{email}</strong>. It works once and expires in 10 minutes.
        </p>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="btn-ghost"
          style={{ marginTop: 14, padding: "8px 14px", width: "auto", display: "inline-flex" }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          padding: "13px 14px",
          borderRadius: 10,
          border: "1px solid var(--line-strong)",
          background: "rgba(255,255,255,0.03)",
          color: "inherit",
          fontSize: 14,
          fontFamily: "inherit",
        }}
      />
      <button type="submit" className="btn-primary" disabled={pending} style={{ marginTop: 0 }}>
        {pending ? "Sending…" : "Continue with email →"}
      </button>
      {state === "error" && (
        <p style={{ color: "#f87272", fontSize: 12, margin: 0, textAlign: "center" }}>{error}</p>
      )}
      <p style={{ color: "var(--muted)", fontSize: 11, textAlign: "center", margin: 0 }}>
        No password to invent — we&apos;ll email you a one-time link.
      </p>
    </form>
  );
}
