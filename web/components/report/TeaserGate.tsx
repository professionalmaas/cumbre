"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { unlockFullReport, completeProfile } from "@/lib/actions/unlock";
import { bandLabel, type Band } from "@/lib/report";

export interface TeaserData {
  title: string;
  overall: number;
  band: Band;
  verdict: string;
  hasCredits: boolean;
}

// Shown instead of the full report until the owner unlocks it (pay + complete profile).
// Deliberately renders only a subset of the report — the parent page never passes the full
// AnalysisReport into this tree when unlocked_full is false, so there is nothing sensitive
// in this component's props to leak via the client bundle either way.
export function TeaserGate({ jobId, teaser }: { jobId: string; teaser: TeaserData }) {
  const [step, setStep] = useState<"idle" | "needs_profile" | "no_credits">("idle");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const score = Math.round(teaser.overall);
  const N = 40,
    cx = 110,
    cy = 96,
    r1 = 66,
    r2 = 88;
  const lit = Math.round((Math.max(0, Math.min(100, score)) / 100) * (N - 1));
  const f = (n: number) => n.toFixed(2);

  function attemptUnlock() {
    setError("");
    startTransition(async () => {
      const res = await unlockFullReport(jobId);
      if (res.ok) {
        router.refresh();
        return;
      }
      if (res.error === "needs_profile") setStep("needs_profile");
      else if (res.error === "no_credits") setStep("no_credits");
      else setError("Couldn't unlock this report. Try again.");
    });
  }

  function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await completeProfile(name);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      attemptUnlock();
    });
  }

  return (
    <div>
      <div
        className="card"
        style={{
          padding: "20px 18px 24px",
          textAlign: "center",
          background: "linear-gradient(180deg,var(--warm),rgba(255,255,255,0.02))",
        }}
      >
        <div style={{ position: "relative", width: 220, height: 120, margin: "0 auto" }}>
          <svg viewBox="0 0 220 110" width="220" height="110" role="img" aria-label={`Summit score ${score} out of 100`}>
            {Array.from({ length: N }, (_, i) => {
              const a = Math.PI - (i / (N - 1)) * Math.PI;
              const on = i <= lit;
              const ti = i / (N - 1);
              return (
                <line
                  key={i}
                  x1={f(cx + r1 * Math.cos(a))}
                  y1={f(cy - r1 * Math.sin(a))}
                  x2={f(cx + r2 * Math.cos(a))}
                  y2={f(cy - r2 * Math.sin(a))}
                  stroke={on ? (ti < 0.5 ? "#e8552d" : "#f6c64a") : "rgba(246,198,74,0.10)"}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          <div style={{ position: "absolute", left: 0, right: 0, top: 48, textAlign: "center" }}>
            <div className="grad-text serif" style={{ fontSize: 48, fontWeight: 600, lineHeight: 1 }}>
              {score}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 3, color: "var(--amber)", marginTop: 2 }}>
              {bandLabel(teaser.band)}
            </div>
          </div>
        </div>
        {teaser.verdict && (
          <p className="serif" style={{ fontStyle: "italic", color: "var(--muted)", margin: "8px 12px 0", fontSize: 15 }}>
            “{teaser.verdict}”
          </p>
        )}
      </div>

      <div
        className="card"
        style={{ marginTop: 16, padding: "20px 18px", textAlign: "center", background: "linear-gradient(180deg,rgba(232,85,45,0.08),rgba(255,255,255,0.02))" }}
      >
        {step === "no_credits" ? (
          <>
            <div className="serif" style={{ fontSize: 18, marginBottom: 6 }}>
              Unlock your full Summit report
            </div>
            <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 16px" }}>
              Subscores, mix notes, and your Top 3 fixes — buy a pass to see the rest.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <a href={process.env.NEXT_PUBLIC_STRIPE_SUMMIT_URL} className="btn-primary" style={{ width: "auto", padding: "10px 18px" }}>
                Summit Pass · $9
              </a>
              <Link href="/plans" className="btn-ghost" style={{ width: "auto", padding: "10px 18px" }}>
                See all plans
              </Link>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 12 }}>
              Already bought a pass? <button type="button" onClick={attemptUnlock} style={{ background: "none", border: "none", color: "var(--amber)", textDecoration: "underline", cursor: "pointer", fontSize: 11 }}>Try unlocking again</button>
            </p>
          </>
        ) : step === "needs_profile" ? (
          <form onSubmit={onSaveProfile}>
            <div className="serif" style={{ fontSize: 18, marginBottom: 6 }}>
              One more step — your artist name
            </div>
            <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 14px" }}>
              How should we credit you on your reports?
            </p>
            <input
              type="text"
              required
              placeholder="Your name or artist name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--line-strong)",
                background: "rgba(255,255,255,0.03)",
                color: "inherit",
                fontSize: 14,
                marginBottom: 10,
                boxSizing: "border-box",
              }}
            />
            <button type="submit" className="btn-primary" disabled={pending} style={{ marginTop: 0 }}>
              {pending ? "Saving…" : "Save & unlock →"}
            </button>
          </form>
        ) : (
          <>
            <div className="serif" style={{ fontSize: 19 }}>
              Ready to see the <span className="grad-text" style={{ fontStyle: "italic" }}>full</span> climb?
            </div>
            <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "6px 0 16px" }}>
              Subscores, mix notes, comparables, and your Top 3 fixes are waiting.
            </p>
            <button type="button" onClick={attemptUnlock} disabled={pending} className="btn-primary" style={{ marginTop: 0 }}>
              {pending ? "Checking…" : "Unlock full report →"}
            </button>
          </>
        )}
        {error && <p style={{ color: "#f87272", fontSize: 12, marginTop: 10 }}>{error}</p>}
      </div>
    </div>
  );
}
