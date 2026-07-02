import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/Brand";
import { LegalFooter } from "@/components/LegalFooter";
import { SAMPLE_TEASERS } from "@/lib/samples";
import { bandLabel } from "@/lib/report";

export const dynamic = "force-static";

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const t = SAMPLE_TEASERS[params.id];
  if (!t) return { title: "Sample report · Cumbre" };
  const title = `${t.title} — ${t.score}/100 on Cumbre`;
  const description = `A sample Cumbre route report for "${t.title}" (${t.genre}): summit score ${t.score}, with a peek at the music and lyrics grades and one fix.`;
  return {
    title: `${t.title} — sample report · Cumbre`,
    description,
    alternates: { canonical: `/sample/${t.id}` },
    // Per-sample OG/Twitter title — the score card image itself comes from the sibling
    // opengraph-image.tsx via Next's file convention.
    openGraph: { title, description },
    twitter: { title, description },
  };
}

// Public TEASER of a sample report — intentionally partial (anti-copy). Shows the gauge,
// verdict, two scores, one fix headline, and two subscores; everything else is locked behind
// "see your own full report".
export default function SampleTeaserPage({ params }: { params: { id: string } }) {
  const t = SAMPLE_TEASERS[params.id];
  if (!t) notFound();

  // mini tick gauge
  const N = 40,
    cx = 110,
    cy = 96,
    r1 = 66,
    r2 = 88;
  const lit = Math.round((t.score / 100) * (N - 1));
  const f = (n: number) => n.toFixed(2);

  return (
    <main className="frame">
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/" className="btn-ghost" aria-label="Back to home" style={{ width: 36, height: 36, padding: 0, borderRadius: 999 }}>
          ‹
        </Link>
        <Brand />
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 2, color: "var(--muted)" }}>
          SAMPLE
        </span>
      </header>

      <div className="eyebrow" style={{ marginTop: 22 }}>
        Sample route report
      </div>
      <h1 className="serif" style={{ fontSize: 28, margin: "8px 0 4px" }}>
        {t.title}
      </h1>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        {t.artist} · {t.genre}
      </div>

      {/* gauge */}
      <div className="card" style={{ padding: "18px", textAlign: "center", background: "linear-gradient(180deg,var(--warm),rgba(255,255,255,0.02))" }}>
        <div style={{ position: "relative", width: 220, height: 120, margin: "0 auto" }}>
          <svg viewBox="0 0 220 110" width="220" height="110">
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
              {t.score}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 3, color: "var(--amber)", marginTop: 2 }}>
              {bandLabel(t.band)}
            </div>
          </div>
        </div>
        <p className="serif" style={{ fontStyle: "italic", color: "var(--muted)", margin: "6px 8px 0", fontSize: 14 }}>
          {t.verdict}
        </p>
      </div>

      {/* two scores */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
        {(
          [
            ["Music", t.music],
            ["Lyrics", t.lyrics],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="card" style={{ padding: "14px 16px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1.5, color: "var(--muted)" }}>
              {k.toUpperCase()}
            </div>
            <div className="serif" style={{ fontSize: 28, marginTop: 2 }}>
              {v}
              <span style={{ fontSize: 14, color: "var(--muted)" }}>/100</span>
            </div>
          </div>
        ))}
      </div>

      {/* one fix headline (note locked) + two subscores */}
      <h2 className="serif" style={{ fontSize: 18, margin: "22px 0 10px" }}>
        A peek at the fixes
      </h2>
      <div className="card" style={{ padding: "14px 16px", borderLeft: "3px solid var(--orange)" }}>
        <b>{t.topFixTitle}</b>
        <div style={{ color: "var(--faint)", fontSize: 13, marginTop: 4, fontStyle: "italic" }}>
          The exact move (and {t.lockedCount} more insights) unlock with your own report.
        </div>
      </div>
      <div className="card" style={{ padding: "6px 16px", marginTop: 10 }}>
        {t.shownSubscores.map((s) => (
          <div
            key={s.label}
            style={{ display: "grid", gridTemplateColumns: "120px 1fr 34px", gap: 10, alignItems: "center", padding: "10px 0" }}
          >
            <span style={{ fontSize: 13, color: "#d9cdb6" }}>{s.label}</span>
            <span style={{ height: 7, borderRadius: 99, background: "#1a130b", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${s.value}%`, background: "linear-gradient(90deg,#fb7a3c,#f6c64a)" }} />
            </span>
            <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700 }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* locked overlay teaser */}
      <div
        className="card"
        style={{
          marginTop: 14,
          padding: "22px 18px",
          textAlign: "center",
          background: "linear-gradient(180deg,rgba(232,85,45,0.08),rgba(255,255,255,0.02))",
        }}
      >
        <div style={{ fontSize: 22 }}>🔒</div>
        <div className="serif" style={{ fontSize: 18, marginTop: 6 }}>
          Market-fit, the energy map, your highlight, the full Top 3 &amp; mix report
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "8px 0 0" }}>
          This is a sample. Your own report scores your track and hands you the exact moves to the
          summit.
        </p>
      </div>

      <Link href="/plans" className="btn-primary" style={{ marginTop: 18 }}>
        Climb your own song →
      </Link>

      <LegalFooter />
    </main>
  );
}
