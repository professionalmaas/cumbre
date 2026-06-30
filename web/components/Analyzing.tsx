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

  // Poll the server for completion; stop on any terminal status or after 8 min.
  useEffect(() => {
    const TERMINAL = ["done", "failed", "rejected", "needs_review"];
    if (TERMINAL.includes(status)) return;
    let elapsed = 0;
    const t = setInterval(() => {
      elapsed += 3000;
      if (elapsed >= 8 * 60 * 1000) { clearInterval(t); return; }
      router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [status, stage, router]);

  // Time-based creep toward a 92% ceiling so the bar always shows motion — the local
  // worker (librosa) can take a couple of minutes, and stage-pinned progress made it look
  // frozen. The page navigates to the report the moment the poll above sees status='done'.
  useEffect(() => {
    const t = setInterval(() => setPct((p) => (p >= 92 ? 92 : p + 1)), 1500);
    return () => clearInterval(t);
  }, []);

  if (status === "failed" || status === "rejected" || status === "needs_review") {
    const review = status === "needs_review";
    const failed = status === "failed";
    return (
      <main className="frame">
        <header><Brand /></header>
        <div style={{ marginTop: 80, textAlign: "center" }}>
          <h1 className="serif" style={{ fontSize: 24 }}>
            {review ? "Your song is in manual review" : failed ? "Analysis failed" : "We couldn't analyze this track"}
          </h1>
          <p style={{ color: "var(--muted)", marginTop: 8 }}>
            {review
              ? "This one needs a human look before we deliver a grade. No charge yet — we'll email you when it's ready."
              : failed
              ? "Something went wrong on our end — no credit was used. Please try again, and reach out if it keeps happening."
              : "The upload was rejected. No credit was used. Try a different file you own."}
          </p>
          <Link href="/upload" className="btn-ghost" style={{ marginTop: 18, display: "inline-block", maxWidth: 260 }}>
            {failed ? "Try again →" : "Back to upload"}
          </Link>
        </div>
      </main>
    );
  }

  // Path waypoints defining the mountain ascent route
  const PATH_PTS: [number, number][] = [
    [10, 205], [45, 178], [75, 160], [88, 170],
    [118, 132], [148, 118], [182, 72], [208, 42], [228, 22],
  ];

  // Compute climber position interpolated along the polyline at current pct
  const segs = PATH_PTS.slice(1).map((p, i) => {
    const a = PATH_PTS[i], b = p;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  const totalLen = segs.reduce((s, l) => s + l, 0);
  const target = (pct / 100) * totalLen;
  let rem = target, cx = PATH_PTS[0][0], cy = PATH_PTS[0][1];
  let climberSegIdx = 0;
  for (let i = 0; i < segs.length; i++) {
    if (rem <= segs[i]) {
      const t = rem / segs[i];
      cx = PATH_PTS[i][0] + t * (PATH_PTS[i + 1][0] - PATH_PTS[i][0]);
      cy = PATH_PTS[i][1] + t * (PATH_PTS[i + 1][1] - PATH_PTS[i][1]);
      climberSegIdx = i;
      break;
    }
    rem -= segs[i];
    climberSegIdx = i + 1;
  }

  // Build completed-path points: all waypoints up to current segment + interpolated climber pos
  const completedPoints = PATH_PTS.slice(0, climberSegIdx + 1).concat([[cx, cy] as [number, number]]);
  // Build remaining-path points: climber pos + remaining waypoints
  const remainingPoints: [number, number][] = [[cx, cy] as [number, number]].concat(PATH_PTS.slice(climberSegIdx + 1));

  const toPolyPts = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(" ");

  const activeIdx = stage ? Math.max(0, STEPS.findIndex((s) => STAGES.indexOf(s.key) >= STAGES.indexOf(stage))) : 0;

  return (
    <main className="frame">
      <header><Brand /></header>
      <div style={{ marginTop: 24, textAlign: "center" }}>
        {/* Dramatic mountain ascent — climber tracks the polyline path */}
        <svg
          viewBox="0 0 280 220"
          width="100%"
          height="220"
          style={{ maxWidth: 320, margin: "0 auto", display: "block" }}
          role="img"
          aria-label={`Analyzing your song — ${pct}% complete`}
        >
          <defs>
            <linearGradient id="sky-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0d0805" />
              <stop offset="1" stopColor="#1a100a" />
            </linearGradient>
            <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e8552d" />
              <stop offset="1" stopColor="#f6c64a" />
            </linearGradient>
            <radialGradient id="summit-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(246,198,74,0.4)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <linearGradient id="trail-grad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="50%" stopColor="#e8552d" />
              <stop offset="100%" stopColor="#f6c64a" />
            </linearGradient>
          </defs>

          {/* Layer 1: Background sky */}
          <rect width="280" height="220" fill="url(#sky-bg)" />

          {/* Layer 2: Stars */}
          <circle cx="40" cy="25" r="1.2" fill="rgba(246,198,74,0.6)" />
          <circle cx="90" cy="15" r="1.2" fill="rgba(246,198,74,0.6)" />
          <circle cx="140" cy="30" r="1.2" fill="rgba(246,198,74,0.6)" />
          <circle cx="190" cy="20" r="1.2" fill="rgba(246,198,74,0.6)" />
          <circle cx="240" cy="35" r="1.2" fill="rgba(246,198,74,0.6)" />
          <circle cx="260" cy="15" r="1.2" fill="rgba(246,198,74,0.6)" />

          {/* Layer 3: Back mountain for depth */}
          <path d="M0 150 L50 95 L90 115 L130 75 L170 90 L220 60 L280 100 L280 220 L0 220Z" fill="#120c08" />

          {/* Layer 4: Summit glow (appears as climber nears the top) */}
          <circle cx="228" cy="22" r="18" fill="url(#summit-glow)" opacity={pct > 70 ? (pct - 70) / 30 : 0} />

          {/* Layer 5: Remaining path (dim dashed) */}
          {remainingPoints.length > 1 && (
            <polyline
              points={toPolyPts(remainingPoints)}
              stroke="rgba(246,198,74,0.18)"
              strokeDasharray="3 5"
              strokeWidth="1.5"
              fill="none"
            />
          )}

          {/* Layer 6: Completed path (bright trail gradient) */}
          {completedPoints.length > 1 && (
            <polyline
              points={toPolyPts(completedPoints)}
              stroke="url(#trail-grad)"
              strokeWidth="2"
              fill="none"
            />
          )}

          {/* Layer 7: Climber bloom glow */}
          <circle cx={cx} cy={cy} r="10" fill="rgba(232,85,45,0.15)">
            {!reduceMotion && <animate attributeName="opacity" values="0.1;0.4;0.1" dur="1.2s" repeatCount="indefinite" />}
          </circle>

          {/* Layer 8: Climber inner dot */}
          <circle cx={cx} cy={cy} r="5.5" fill="url(#cg)" />

          {/* Layer 9: Summit flag (shown near completion) */}
          {pct > 90 && (
            <>
              <line x1="228" y1="22" x2="228" y2="10" stroke="var(--gold)" strokeWidth="1.2" />
              <path d="M228 10 L238 14 L228 18Z" fill="var(--gold)" />
            </>
          )}
        </svg>

        <div className="grad-text serif" style={{ fontSize: 48, fontWeight: 600, marginTop: 6 }}>
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
