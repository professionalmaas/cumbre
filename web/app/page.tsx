import Link from "next/link";
import { Brand } from "@/components/Brand";
import { SampleCards } from "@/components/SampleCards";
import { LegalFooter } from "@/components/LegalFooter";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: 1, title: "Drop your track", note: "MP3 or WAV, up to 12 minutes. Pick the genre you're climbing in." },
  { n: 2, title: "Your guide scores the climb", note: "We listen to the mix and read every lyric, then score music and words across a dozen holds." },
  { n: 3, title: "Get the route to the summit", note: "A 0–100 summit score, your Top 3 fixes, and the exact moves to climb higher." },
];

export default function EntryPage() {
  return (
    <main className="frame">
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Brand />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 2, color: "var(--muted)" }}>
          HOW IT WORKS
        </span>
      </header>

      <div className="eyebrow" style={{ marginTop: 26 }}>
        AI Song Coach
      </div>
      <h1 className="serif" style={{ fontSize: 39, lineHeight: 1.1, margin: "10px 0 14px" }}>
        See how your song <span className="grad-text" style={{ fontStyle: "italic" }}>climbs.</span>
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 14.5, maxWidth: 360 }}>
        A pro climbing guide for your music. Drop a track and get a clear, scored route to the summit —
        what&apos;s working, and the exact moves to get higher.
      </p>

      <div className="eyebrow" style={{ marginTop: 30 }}>
        How it works
      </div>
      <div style={{ marginTop: 8 }}>
        {STEPS.map((s) => (
          <div
            key={s.n}
            style={{
              display: "grid",
              gridTemplateColumns: "34px 1fr",
              gap: 14,
              padding: "18px 0",
              borderTop: "1px solid var(--line-soft)",
            }}
          >
            <div className="serif grad-text" style={{ fontSize: 28, fontWeight: 600, lineHeight: 1 }}>
              {s.n}
            </div>
            <div>
              <b style={{ display: "block", marginBottom: 3 }}>{s.title}</b>
              <span style={{ color: "var(--muted)", fontSize: 14 }}>{s.note}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="eyebrow" style={{ marginTop: 22 }}>
        Two real reports
      </div>
      <SampleCards />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginTop: 22,
          color: "var(--muted)",
          fontSize: 12.5,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 28 28" fill="none" aria-hidden>
          <path d="M2 24 L10 7 L15 15 L18 10 L26 24 Z" fill="#a89a82" opacity=".6" />
        </svg>
        Your audio is never stored — we analyze your track, then delete it.
      </div>

      <Link href="/plans" className="btn-primary" style={{ marginTop: 24 }}>
        See plans &amp; start climbing →
      </Link>

      <LegalFooter />
    </main>
  );
}
