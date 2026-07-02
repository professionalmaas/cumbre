"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";

interface Sample {
  id: string;
  title: string;
  artist: string;
  genre: string;
  score: number;
  band: string;
  takeaway: string;
  src: string;
}

// NOTE: sample clips are copyrighted (Tame Impala/JENNIE, Drake) — replace with cleared/owned
// demo clips before any public launch (see docs/design_v2/README.md §Assets).
const SAMPLES: Sample[] = [
  {
    id: "dracula",
    title: "Dracula (JENNIE Remix)",
    artist: "Tame Impala, JENNIE",
    genre: "Pop",
    score: 81,
    band: "SUMMIT",
    takeaway: "A summit-grade hook and a mix that translates everywhere.",
    src: "/samples/dracula.mp3",
  },
  {
    id: "janice",
    title: "Janice STFU",
    artist: "Drake",
    genre: "Hip-Hop",
    score: 66,
    band: "ASCENDING",
    takeaway: "Strong pocket and presence — the back half needs one more lift.",
    src: "/samples/janice.mp3",
  },
];

function MiniGauge({ score }: { score: number }) {
  const N = 24,
    cx = 46,
    cy = 44,
    r1 = 26,
    r2 = 36;
  const lit = Math.round((score / 100) * (N - 1));
  return (
    <svg viewBox="0 0 92 50" width="92" height="50">
      {Array.from({ length: N }, (_, i) => {
        const t = i / (N - 1);
        const a = Math.PI - t * Math.PI;
        const on = i <= lit;
        const f = (n: number) => n.toFixed(2); // deterministic server/client SVG coords
        return (
          <line
            key={i}
            x1={f(cx + r1 * Math.cos(a))}
            y1={f(cy - r1 * Math.sin(a))}
            x2={f(cx + r2 * Math.cos(a))}
            y2={f(cy - r2 * Math.sin(a))}
            stroke={on ? (t < 0.5 ? "#e8552d" : "#f6c64a") : "rgba(246,198,74,0.10)"}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export function SampleCards() {
  const refs = useRef<Record<string, HTMLAudioElement | null>>({});
  const [playing, setPlaying] = useState<string | null>(null);

  function toggle(id: string) {
    const a = refs.current[id];
    if (!a) return;
    if (playing === id) {
      a.pause();
      setPlaying(null);
      return;
    }
    // pause the other
    Object.entries(refs.current).forEach(([k, el]) => {
      if (k !== id && el) el.pause();
    });
    a.play()
      .then(() => {
        setPlaying(id);
        track("sample_play", { sample: id });
      })
      .catch(() => setPlaying(null));
  }

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
      {SAMPLES.map((s) => (
        <div key={s.id} className="card" style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ position: "relative", width: 92, flexShrink: 0 }}>
              <MiniGauge score={s.score} />
              <div
                className="grad-text"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 20,
                  textAlign: "center",
                  fontFamily: "var(--font-serif)",
                  fontWeight: 600,
                  fontSize: 22,
                }}
              >
                {s.score}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="serif" style={{ fontSize: 17, lineHeight: 1.15 }}>
                {s.title}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                {s.artist} · {s.genre} · {s.band}
              </div>
            </div>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "12px 0 12px" }}>{s.takeaway}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              onClick={() => toggle(s.id)}
              aria-label={playing === s.id ? `Pause preview of ${s.title}` : `Play preview of ${s.title}`}
              aria-pressed={playing === s.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                border: "1px solid rgba(246,198,74,0.3)",
                color: "var(--gold)",
                background: "transparent",
                borderRadius: 999,
                padding: "7px 14px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {playing === s.id ? "■ Pause" : "▶ Preview"}
            </button>
            <Link href={`/sample/${s.id}`} style={{ fontSize: 13, color: "var(--muted)", textDecoration: "underline" }}>
              See the report →
            </Link>
          </div>
          <audio
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            src={s.src}
            preload="none"
            onEnded={() => setPlaying(null)}
          />
        </div>
      ))}
    </div>
  );
}
