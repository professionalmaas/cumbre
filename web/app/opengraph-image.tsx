import { ImageResponse } from "next/og";

// Static, branded default OG card (1200x630). Used for any route that doesn't define its
// own opengraph-image. Pure inline styles + an inline SVG mark so it renders without fonts
// or external assets. runtime is left default (nodejs is fine for a static card).
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Cumbre — Get your song to the summit";

// Generate on request rather than at build time. The card is static, but the bundled
// @vercel/og asset loader fails to resolve its font/wasm via file URL during the Windows
// build-time prerender; deferring to request time avoids that and is when OG crawlers fetch
// it anyway. (Harmless no-op on platforms where prerender would have worked.)
export const dynamic = "force-dynamic";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg,#1c140b,#130d07 55%,#0c0905)",
          color: "#f7efe2",
        }}
      >
        <svg width="200" height="200" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="og" x1="96" y1="384" x2="416" y2="128" gradientUnits="userSpaceOnUse">
              <stop stopColor="#e8552d" />
              <stop offset="0.55" stopColor="#fb7a3c" />
              <stop offset="1" stopColor="#f6c64a" />
            </linearGradient>
          </defs>
          <path d="M96 376 L216 168 L296 304 L344 224 L416 376 Z" fill="url(#og)" />
        </svg>
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: -2,
            marginTop: 24,
            backgroundImage: "linear-gradient(135deg,#e8552d,#fb7a3c,#f6c64a)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Cumbre
        </div>
        <div style={{ fontSize: 36, color: "#a89a82", marginTop: 12 }}>
          Get your song to the summit.
        </div>
      </div>
    ),
    { ...size },
  );
}
