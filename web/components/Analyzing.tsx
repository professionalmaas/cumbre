"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/Brand";

const STAGES = ["validate", "moderate", "fingerprint", "extract", "score", "feedback", "charge", "deliver"];
const STEPS = [
  { key: "extract", label: "Listening to the mix" },
  { key: "score", label: "Reading the lyrics" },
  { key: "feedback", label: "Charting the melody" },
  { key: "deliver", label: "Scoring the route" },
];

export function Analyzing({ status, stage }: { status: string; stage: string | null }) {
  const router = useRouter();
  const [pct, setPct] = useState(8);
  // SMIL <animate> isn't covered by the global prefers-reduced-motion CSS rule, so gate it in JS.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Poll the server for completion; ease a progress bar toward the current stage.
  useEffect(() => {
    if (status === "done" || status === "rejected" || status === "needs_review") return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [status, stage, router]);

  // Time-based creep toward a 92% ceiling so the bar always shows motion — the local
  // worker (librosa) can take a couple of minutes, and stage-pinned progress made it look
  // frozen. The page navigates to the report the moment the poll above sees status='done'.
  useEffect(() => {
    const t = setInterval(() => setPct((p) => (p >= 92 ? 92 : p + 1)), 1500);
    return () => clearInterval(t);
  }, []);

  if (status === "rejected" || status === "needs_review") {
    const review = status === "needs_review";
    return (
      <main className="frame">
        <header><Brand /></header>
        <div style={{ marginTop: 80, textAlign: "center" }}>
          <h1 className="serif" style={{ fontSize: 24 }}>
            {review ? "Your song is in manual review" : "We couldn't analyze this track"}
          </h1>
          <p style={{ color: "var(--muted)", marginTop: 8 }}>
            {review
              ? "This one needs a human look before we deliver a grade. No charge yet — we'll email you when it's ready."
              : "The upload was rejected. No credit was used. Try a different file you own."}
          </p>
          <Link href="/upload" className="btn-ghost" style={{ marginTop: 18, display: "inline-block", maxWidth: 260 }}>
            Back to upload
          </Link>
        </div>
      </main>
    );
  }

  const activeIdx = stage ? Math.max(0, STEPS.findIndex((s) => STAGES.indexOf(s.key) >= STAGES.indexOf(stage))) : 0;

  return (
    <main className="frame">
      <header><Brand /></header>
      <div style={{ marginTop: 30, textAlign: "center" }}>
        {/* ascent ridge with a climber dot */}
        <svg
          viewBox="0 0 320 150"
          width="100%"
          height="150"
          style={{ maxWidth: 340, margin: "0 auto" }}
          role="img"
          aria-label={`Analyzing your song — ${pct} percent complete`}
        >
          <path d="M10 140 L90 70 L150 100 L210 40 L310 130" fill="none" stroke="rgba(246,198,74,0.18)" strokeWidth="2" />
          <path d="M210 40 L240 20 L270 55" fill="none" stroke="var(--gold)" strokeWidth="2" />
          <circle cx={10 + (pct / 100) * 300} cy={140 - (pct / 100) * 110} r="6" fill="url(#cg)">
            {!reduceMotion && <animate attributeName="opacity" values="0.5;1;0.5" dur="1.4s" repeatCount="indefinite" />}
          </circle>
          <defs>
            <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e8552d" />
              <stop offset="1" stopColor="#f6c64a" />
            </linearGradient>
          </defs>
        </svg>

        <div className="grad-text serif" style={{ fontSize: 44, fontWeight: 600, marginTop: 6 }}>
          {pct}%
        </div>
        <div style={{ height: 7, borderRadius: 99, background: "#1a130b", overflow: "hidden", margin: "12px auto 0", maxWidth: 280 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "var(--grad)" }} />
        </div>

        <div style={{ display: "grid", gap: 10, maxWidth: 280, margin: "26px auto 0", textAlign: "left" }}>
          {STEPS.map((s, i) => {
            const done = i < activeIdx;
            const active = i === activeIdx;
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 99,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    color: done ? "#1a1205" : "var(--muted)",
                    background: done ? "var(--grad)" : "transparent",
                    border: done ? "0" : `1px solid ${active ? "var(--gold)" : "var(--line-strong)"}`,
                  }}
                >
                  {done ? "✓" : ""}
                </span>
                <span style={{ fontSize: 14, color: active ? "var(--ink)" : done ? "var(--muted)" : "var(--faint)" }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 24 }}>
          Hang tight — your guide is scoring the route. The first local analysis can take a couple of
          minutes; this page updates itself the moment it&apos;s ready.
        </p>
      </div>
    </main>
  );
}
