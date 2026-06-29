"use client";

/**
 * LandingIntro — cinematic full-viewport intro splash for the Cumbre landing.
 *
 * Concept "The Ascent": the brand summit-ridge + climber-dot motif (from Brand.tsx /
 * Analyzing.tsx) scaled up to a full hero. An ember→gold aurora glows behind layered
 * parallax ridges; ember particles drift up; a climber dot eases up the ridge toward a
 * glowing summit; a row of equalizer bars at the base pulses like a soundwave horizon
 * (the "music" tie-in). One serif headline + one gradient "Enter" button.
 *
 * Motion discipline: every animation is transform/opacity only (GPU-composited, no layout
 * thrash), CSS-driven, looping cheaply. On Enter the whole overlay scales+fades out (~600ms)
 * revealing the SSR'd landing beneath, and sessionStorage remembers the choice for the
 * session. prefers-reduced-motion gets a fully static, still-composed scene (no loops, no
 * exit transform — just an instant fade).
 *
 * The underlying page.tsx content stays in the DOM the whole time (SEO + accessibility);
 * this is a fixed overlay above it, not a route.
 */

import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "cumbre_entered";

export function LandingIntro() {
  // Render nothing until we've checked sessionStorage on the client. This avoids a flash of
  // the splash for visitors who already entered this session, and keeps the server output
  // (the real landing) untouched.
  const [phase, setPhase] = useState<"pending" | "show" | "leaving" | "gone">("pending");
  const [reduceMotion, setReduceMotion] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let entered = false;
    try {
      entered = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* sessionStorage can throw in private mode — treat as not-entered */
    }
    if (entered) {
      setPhase("gone");
      return;
    }
    if (typeof window !== "undefined" && window.matchMedia) {
      setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
    setPhase("show");
    // Lock background scroll while the splash is up.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  const enter = () => {
    if (phase !== "show") return;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    document.body.style.overflow = "";
    if (reduceMotion) {
      setPhase("gone");
      return;
    }
    setPhase("leaving");
    leaveTimer.current = setTimeout(() => setPhase("gone"), 620);
  };

  // Global Enter-key affordance while the splash is up.
  useEffect(() => {
    if (phase !== "show") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        enter();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reduceMotion]);

  if (phase === "pending" || phase === "gone") return null;

  const leaving = phase === "leaving";

  return (
    <div
      className={`ci-root${leaving ? " ci-leaving" : ""}${reduceMotion ? " ci-static" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Cumbre"
    >
      {/* ---- Scene ---- */}
      <div className="ci-scene" aria-hidden="true">
        {/* Aurora / sky glow (animated background-position-free: we move a wrapper, not bg) */}
        <div className="ci-aurora" />
        <div className="ci-aurora ci-aurora-2" />

        {/* Drifting ember particles — pure transform translate/opacity loops */}
        <div className="ci-particles">
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="ci-particle"
              style={{
                left: `${p.x}%`,
                bottom: `${p.y}%`,
                width: p.s,
                height: p.s,
                animationDuration: `${p.d}s`,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}
        </div>

        {/* Mountain ridges — the brand motif, layered for parallax depth */}
        <svg
          className="ci-ridges"
          viewBox="0 0 1000 560"
          preserveAspectRatio="xMidYMax slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="ci-summit" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#e8552d" />
              <stop offset="0.5" stopColor="#fb7a3c" />
              <stop offset="1" stopColor="#f6c64a" />
            </linearGradient>
            <radialGradient id="ci-sunglow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#f6c64a" stopOpacity="0.9" />
              <stop offset="0.4" stopColor="#fb7a3c" stopOpacity="0.5" />
              <stop offset="1" stopColor="#e8552d" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* sun glow behind the summit */}
          <circle className="ci-sun" cx="650" cy="150" r="170" fill="url(#ci-sunglow)" />

          {/* far ridge (faint, slow drift) */}
          <g className="ci-layer ci-layer-far">
            <path
              d="M0 560 L0 360 L150 300 L320 350 L480 250 L650 320 L820 230 L1000 300 L1000 560 Z"
              fill="rgba(168,154,130,0.10)"
            />
          </g>

          {/* mid ridge */}
          <g className="ci-layer ci-layer-mid">
            <path
              d="M0 560 L0 420 L180 360 L360 410 L540 320 L720 400 L900 330 L1000 380 L1000 560 Z"
              fill="rgba(217,154,74,0.14)"
            />
          </g>

          {/* hero ridge — the climbing route, with a glowing summit cap */}
          <g className="ci-layer ci-layer-near">
            <path
              d="M0 560 L0 470 L210 420 L380 460 L560 300 L650 150 L740 290 L880 430 L1000 400 L1000 560 Z"
              fill="rgba(20,15,9,0.92)"
              stroke="rgba(246,198,74,0.22)"
              strokeWidth="1.5"
            />
            {/* lit summit edge (the final pitch to the top) */}
            <path
              className="ci-summit-edge"
              d="M560 300 L650 150 L740 290"
              fill="none"
              stroke="url(#ci-summit)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* the climber dot, ascending the route toward the summit (650,150) */}
            <circle className="ci-climber" r="7" fill="url(#ci-summit)" />
            {/* summit flag glint */}
            <circle className="ci-flag" cx="650" cy="150" r="4" fill="#fff" />
          </g>
        </svg>

        {/* Equalizer bars — soundwave horizon at the base (the "music" tie-in) */}
        <div className="ci-eq" aria-hidden="true">
          {EQ_BARS.map((b, i) => (
            <span
              key={i}
              className="ci-bar"
              style={{ animationDuration: `${b.d}s`, animationDelay: `${b.delay}s` }}
            />
          ))}
        </div>

        {/* base vignette to seat the bars/copy */}
        <div className="ci-vignette" />
      </div>

      {/* ---- Copy + CTA ---- */}
      <div className="ci-content">
        <div className="ci-brand">
          <svg width="20" height="20" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path d="M2 24 L10 7 L15 15 L18 10 L26 24 Z" fill="url(#ci-mark)" />
            <path d="M10 7 l2.6 5 -2.6 1.4 -2.1 -1.1z" fill="#fff" opacity=".92" />
            <defs>
              <linearGradient id="ci-mark" x1="0" y1="28" x2="28" y2="0">
                <stop offset="0" stopColor="#e8552d" />
                <stop offset=".5" stopColor="#fb7a3c" />
                <stop offset="1" stopColor="#f6c64a" />
              </linearGradient>
            </defs>
          </svg>
          <span className="ci-wordmark">Cumbre</span>
        </div>

        <div className="ci-eyebrow">AI Song Coach</div>

        <h1 className="ci-headline serif">
          You wrote a hit.
          <br />
          <span className="ci-grad">Let&apos;s prove it.</span>
        </h1>

        <p className="ci-sub">
          A pro climbing guide for your music — a genre-aware, fame-blind craft grade and the Top 3
          moves to the summit.
        </p>

        <button type="button" className="ci-enter" onClick={enter} autoFocus>
          Enter
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 12h13M13 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="ci-hint">
          press <kbd>Enter ↵</kbd>
        </div>
      </div>

      <style jsx>{`
        .ci-root {
          position: fixed;
          inset: 0;
          z-index: 100;
          overflow: hidden;
          background: radial-gradient(1200px 800px at 50% 8%, #2a1c0e 0%, #150f08 45%, #0d0a06 100%);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          opacity: 1;
          transform: scale(1);
          transition: opacity 600ms ease, transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: opacity, transform;
        }
        .ci-leaving {
          opacity: 0;
          transform: scale(1.08);
          pointer-events: none;
        }

        /* ---- Scene ---- */
        .ci-scene {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }
        .ci-aurora {
          position: absolute;
          top: -25%;
          left: -20%;
          width: 140%;
          height: 90%;
          background: radial-gradient(
            closest-side,
            rgba(232, 85, 45, 0.32),
            rgba(251, 122, 60, 0.14) 55%,
            transparent 75%
          );
          filter: blur(8px);
          transform: translate3d(0, 0, 0);
          animation: ci-aurora 14s ease-in-out infinite;
          will-change: transform, opacity;
        }
        .ci-aurora-2 {
          top: -30%;
          left: 10%;
          width: 110%;
          height: 80%;
          background: radial-gradient(
            closest-side,
            rgba(246, 198, 74, 0.22),
            rgba(217, 154, 74, 0.1) 55%,
            transparent 75%
          );
          animation: ci-aurora2 18s ease-in-out infinite;
          animation-delay: -4s;
        }
        @keyframes ci-aurora {
          0%,
          100% {
            transform: translate3d(-3%, 0, 0) scale(1);
            opacity: 0.85;
          }
          50% {
            transform: translate3d(4%, -2%, 0) scale(1.08);
            opacity: 1;
          }
        }
        @keyframes ci-aurora2 {
          0%,
          100% {
            transform: translate3d(3%, 1%, 0) scale(1.05);
            opacity: 0.7;
          }
          50% {
            transform: translate3d(-4%, -1%, 0) scale(1);
            opacity: 0.95;
          }
        }

        .ci-particles {
          position: absolute;
          inset: 0;
        }
        .ci-particle {
          position: absolute;
          display: block;
          border-radius: 50%;
          background: radial-gradient(circle, #f6c64a, #fb7a3c 60%, transparent 70%);
          opacity: 0;
          transform: translate3d(0, 0, 0);
          animation-name: ci-rise;
          animation-timing-function: ease-in;
          animation-iteration-count: infinite;
          will-change: transform, opacity;
        }
        @keyframes ci-rise {
          0% {
            transform: translate3d(0, 0, 0) scale(0.6);
            opacity: 0;
          }
          12% {
            opacity: 0.9;
          }
          80% {
            opacity: 0.5;
          }
          100% {
            transform: translate3d(14px, -240px, 0) scale(1.1);
            opacity: 0;
          }
        }

        .ci-ridges {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        .ci-sun {
          transform-origin: 650px 150px;
          animation: ci-pulse 6s ease-in-out infinite;
        }
        @keyframes ci-pulse {
          0%,
          100% {
            opacity: 0.75;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.06);
          }
        }
        .ci-layer {
          transform: translate3d(0, 0, 0);
          will-change: transform;
        }
        .ci-layer-far {
          animation: ci-drift-far 22s ease-in-out infinite;
        }
        .ci-layer-mid {
          animation: ci-drift-mid 16s ease-in-out infinite;
        }
        @keyframes ci-drift-far {
          0%,
          100% {
            transform: translate3d(-1.2%, 0, 0);
          }
          50% {
            transform: translate3d(1.2%, 0, 0);
          }
        }
        @keyframes ci-drift-mid {
          0%,
          100% {
            transform: translate3d(1.5%, 0, 0);
          }
          50% {
            transform: translate3d(-1.5%, 0, 0);
          }
        }
        .ci-summit-edge {
          stroke-dasharray: 320;
          stroke-dashoffset: 320;
          animation: ci-draw 3.4s ease-out 0.3s forwards;
        }
        @keyframes ci-draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        /* climber ascends the route, easing toward the summit, then resets and re-climbs */
        .ci-climber {
          animation: ci-climb 6s cubic-bezier(0.45, 0.05, 0.3, 1) infinite;
          will-change: transform, opacity;
        }
        @keyframes ci-climb {
          0% {
            transform: translate(210px, 420px);
            opacity: 0;
          }
          8% {
            opacity: 1;
          }
          40% {
            transform: translate(380px, 460px);
          }
          78% {
            transform: translate(560px, 300px);
            opacity: 1;
          }
          92% {
            transform: translate(650px, 150px);
            opacity: 1;
          }
          100% {
            transform: translate(650px, 150px);
            opacity: 0;
          }
        }
        .ci-flag {
          transform-origin: 650px 150px;
          animation: ci-glint 6s ease-in-out infinite;
        }
        @keyframes ci-glint {
          0%,
          85%,
          100% {
            opacity: 0.4;
            transform: scale(1);
          }
          92% {
            opacity: 1;
            transform: scale(1.8);
          }
        }

        .ci-eq {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 64px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 4px;
          padding: 0 6px;
          opacity: 0.55;
        }
        .ci-bar {
          flex: 1 1 auto;
          max-width: 7px;
          min-width: 3px;
          height: 100%;
          border-radius: 3px 3px 0 0;
          background: linear-gradient(180deg, #f6c64a, #e8552d);
          transform: scaleY(0.18);
          transform-origin: bottom;
          animation-name: ci-eq;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          will-change: transform;
        }
        @keyframes ci-eq {
          0%,
          100% {
            transform: scaleY(0.18);
          }
          50% {
            transform: scaleY(1);
          }
        }

        .ci-vignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(180deg, transparent 35%, rgba(13, 10, 6, 0.55) 78%, rgba(13, 10, 6, 0.95) 100%);
        }

        /* ---- Copy ---- */
        .ci-content {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 440px;
          padding: 0 26px 64px;
          text-align: center;
          animation: ci-content-in 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes ci-content-in {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .ci-brand {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 22px;
        }
        .ci-wordmark {
          font-family: var(--font-mono);
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: var(--ink);
        }
        .ci-eyebrow {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: var(--amber);
          margin-bottom: 12px;
        }
        .ci-headline {
          font-family: var(--font-serif);
          font-weight: 500;
          font-size: 40px;
          line-height: 1.08;
          margin: 0 0 16px;
          color: var(--ink);
          text-wrap: balance;
        }
        .ci-grad {
          background: var(--grad);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-style: italic;
        }
        .ci-sub {
          color: var(--muted);
          font-size: 15px;
          line-height: 1.5;
          margin: 0 auto 28px;
          max-width: 360px;
        }
        .ci-enter {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          max-width: 280px;
          padding: 16px 22px;
          border-radius: 14px;
          border: 0;
          font-family: var(--font-sans);
          font-weight: 700;
          font-size: 16px;
          letter-spacing: 0.2px;
          cursor: pointer;
          color: #1a1205;
          background: var(--grad);
          box-shadow: var(--glow);
          transition: transform 160ms ease, box-shadow 160ms ease;
          will-change: transform;
        }
        .ci-enter:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 40px -10px rgba(251, 122, 60, 0.75);
        }
        .ci-enter:active {
          transform: translateY(0);
        }
        .ci-hint {
          margin-top: 16px;
          font-size: 12px;
          color: var(--faint);
        }
        .ci-hint kbd {
          font-family: var(--font-mono);
          font-size: 11px;
          padding: 2px 7px;
          border-radius: 6px;
          border: 1px solid var(--line-strong);
          color: var(--muted);
        }

        @media (min-width: 640px) {
          .ci-content {
            max-width: 540px;
            padding-bottom: 88px;
          }
          .ci-headline {
            font-size: 56px;
          }
          .ci-sub {
            font-size: 16.5px;
            max-width: 440px;
          }
          .ci-eq {
            height: 88px;
          }
        }
        @media (min-width: 1024px) {
          .ci-headline {
            font-size: 68px;
          }
        }

        /* ---- Reduced motion: a still, composed scene; instant fade only ---- */
        .ci-static .ci-aurora,
        .ci-static .ci-aurora-2,
        .ci-static .ci-particle,
        .ci-static .ci-sun,
        .ci-static .ci-layer-far,
        .ci-static .ci-layer-mid,
        .ci-static .ci-summit-edge,
        .ci-static .ci-climber,
        .ci-static .ci-flag,
        .ci-static .ci-bar,
        .ci-static .ci-content {
          animation: none !important;
        }
        .ci-static .ci-particle {
          opacity: 0; /* hide drifting embers in the static scene */
        }
        .ci-static .ci-summit-edge {
          stroke-dashoffset: 0; /* show the route fully drawn */
        }
        .ci-static .ci-climber {
          /* park the climber near the summit in the static composition */
          transform: translate(620px, 175px);
          opacity: 1;
        }
        .ci-static .ci-flag {
          opacity: 1;
        }
        .ci-static .ci-bar {
          /* a frozen, varied equalizer silhouette */
          transform: scaleY(0.5);
        }
        .ci-static .ci-bar:nth-child(odd) {
          transform: scaleY(0.8);
        }
        .ci-static .ci-bar:nth-child(3n) {
          transform: scaleY(0.35);
        }
        .ci-static.ci-root {
          transition: opacity 200ms ease;
        }

        @media (prefers-reduced-motion: reduce) {
          .ci-aurora,
          .ci-aurora-2,
          .ci-particle,
          .ci-sun,
          .ci-layer-far,
          .ci-layer-mid,
          .ci-summit-edge,
          .ci-climber,
          .ci-flag,
          .ci-bar,
          .ci-content {
            animation: none !important;
          }
          .ci-particle {
            opacity: 0;
          }
          .ci-summit-edge {
            stroke-dashoffset: 0;
          }
          .ci-climber {
            transform: translate(620px, 175px);
            opacity: 1;
          }
          .ci-flag {
            opacity: 1;
          }
          .ci-bar {
            transform: scaleY(0.5);
          }
          .ci-bar:nth-child(odd) {
            transform: scaleY(0.8);
          }
          .ci-bar:nth-child(3n) {
            transform: scaleY(0.35);
          }
          .ci-root {
            transition: opacity 200ms ease;
          }
        }
      `}</style>
    </div>
  );
}

// Static, deterministic particle + bar configs (no Math.random → no SSR/CSR hydration drift,
// though this is a client component the values stay stable across renders).
const PARTICLES = [
  { x: 12, y: 8, s: 4, d: 9, delay: 0 },
  { x: 24, y: 4, s: 3, d: 11, delay: 1.5 },
  { x: 38, y: 12, s: 5, d: 8, delay: 3 },
  { x: 52, y: 6, s: 3, d: 12, delay: 0.8 },
  { x: 63, y: 10, s: 4, d: 10, delay: 2.2 },
  { x: 74, y: 5, s: 3, d: 9.5, delay: 4 },
  { x: 86, y: 9, s: 5, d: 11.5, delay: 1.2 },
  { x: 45, y: 3, s: 3, d: 10.5, delay: 5 },
  { x: 18, y: 14, s: 3, d: 13, delay: 2.8 },
  { x: 92, y: 7, s: 4, d: 8.5, delay: 3.6 },
];

// Equalizer bars: deterministic durations/delays for a lively, non-uniform pulse.
const EQ_BARS = Array.from({ length: 28 }, (_, i) => ({
  d: 0.9 + ((i * 7) % 11) / 10, // 0.9s–1.9s
  delay: ((i * 13) % 17) / 17, // 0–~1s
}));
