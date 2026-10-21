/* eslint-disable @next/next/no-img-element */
// Reusable OG score card (1200x630) for next/og ImageResponse — the shareable "score card"
// that is the viral mechanic. Used today by /sample/[id]/opengraph-image; built generically
// so authenticated user reports can reuse it later (share/[token] can migrate too).
// Constraints of @vercel/og: every multi-child element must be display:flex; no external
// fonts/assets — pure inline styles + inline SVG, matching the site's warm-dark palette.

export interface ScoreCardOgProps {
  title: string;
  subtitle: string; // e.g. "Cumbre demo · Pop"
  score?: number; // omit for a generic branded card (no score row)
  bandLabel: string; // "SUMMIT" | "ASCENDING" | "BASE CAMP" (or a brand word on generic cards)
  kicker?: string; // small eyebrow, defaults to "SAMPLE ROUTE REPORT"
}

export function ScoreCardOg({ title, subtitle, score, bandLabel, kicker = "SAMPLE ROUTE REPORT" }: ScoreCardOgProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "72px 80px",
        background: "linear-gradient(160deg,#1c140b,#130d07 55%,#0d0a06)",
        color: "#f7efe2",
        position: "relative",
      }}
    >
      {/* subtle mountain silhouette, bottom-right */}
      <svg
        width="560"
        height="360"
        viewBox="0 0 512 512"
        style={{ position: "absolute", right: -60, bottom: -80, opacity: 0.12 }}
      >
        <path d="M96 376 L216 168 L296 304 L344 224 L416 376 Z" fill="#fb7a3c" />
      </svg>

      {/* wordmark row */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width="40" height="40" viewBox="0 0 512 512">
          <path d="M96 376 L216 168 L296 304 L344 224 L416 376 Z" fill="#fb7a3c" />
        </svg>
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 8, fontWeight: 700 }}>CUMBRE</div>
        <div style={{ display: "flex", fontSize: 20, letterSpacing: 4, color: "#a89a82", marginLeft: "auto" }}>
          {kicker}
        </div>
      </div>

      {/* score + band (score row hidden on generic cards) */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 28, marginTop: 30 }}>
        {typeof score === "number" && (
          <div
            style={{
              display: "flex",
              fontSize: 220,
              fontWeight: 700,
              lineHeight: 1,
              backgroundImage: "linear-gradient(135deg,#e8552d,#fb7a3c,#f6c64a)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {score}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              display: "flex",
              fontSize: 34,
              letterSpacing: 10,
              color: "#f6c64a",
              border: "2px solid rgba(246,198,74,0.45)",
              borderRadius: 999,
              padding: "10px 26px",
            }}
          >
            {bandLabel}
          </div>
          {typeof score === "number" && (
            <div style={{ display: "flex", fontSize: 24, color: "#a89a82" }}>summit score / 100</div>
          )}
        </div>
      </div>

      {/* track title + subtitle */}
      <div style={{ display: "flex", fontSize: 52, fontWeight: 600, marginTop: 34 }}>{title}</div>
      <div style={{ display: "flex", fontSize: 28, color: "#a89a82", marginTop: 10 }}>{subtitle}</div>

      <div style={{ display: "flex", fontSize: 26, color: "#fb7a3c", marginTop: 30 }}>
        How high does your song climb? → getcumbre.com
      </div>
    </div>
  );
}
