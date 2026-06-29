import { ImageResponse } from "next/og";
import { getSharePublic } from "@/lib/queries";
import { bandLabel, type Band } from "@/lib/report";

// Dynamic OG card for a shared summit. Renders on the Node runtime (the share lookup uses pg,
// which can't run on edge). Shows ONLY score/band/title/verdict — no methodology. If the token
// is unknown we still return a generic branded card rather than 404 (link previews degrade nicely).
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: { token: string } }) {
  let title = "Cumbre";
  let score: number | null = null;
  let band: Band = "ascending";
  let verdict = "An AI craft grade for your song.";
  try {
    const s = await getSharePublic(params.token);
    if (s) {
      title = s.title;
      score = Math.round(s.overall);
      band = s.band as Band;
      verdict = s.verdict || verdict;
    }
  } catch {
    // fall back to the generic branded card
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg,#1c140b,#130d07 55%,#0c0905)",
          color: "#f7efe2",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <svg width="40" height="40" viewBox="0 0 28 28">
            <path d="M2 24 L10 7 L15 15 L18 10 L26 24 Z" fill="#fb7a3c" />
          </svg>
          <span style={{ fontSize: 26, letterSpacing: 8, fontWeight: 700 }}>CUMBRE</span>
        </div>

        {score !== null && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 22, marginBottom: 14 }}>
            <span style={{ fontSize: 200, fontWeight: 700, lineHeight: 1, color: "#f6c64a" }}>{score}</span>
            <span style={{ fontSize: 40, letterSpacing: 8, color: "#d99a4a" }}>{bandLabel(band)}</span>
          </div>
        )}

        <div style={{ fontSize: 46, fontWeight: 600, marginBottom: 14 }}>{title}</div>
        <div style={{ fontSize: 30, color: "#a89a82", maxWidth: 980 }}>
          {verdict.length > 120 ? verdict.slice(0, 117) + "…" : verdict}
        </div>

        <div style={{ marginTop: 44, fontSize: 26, color: "#fb7a3c" }}>Grade your own song → cumbre</div>
      </div>
    ),
    { ...size }
  );
}
