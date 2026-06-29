"use client";

// Last-resort boundary: catches errors thrown in the root layout itself. It REPLACES the
// root layout, so it must render its own <html>/<body>. globals.css isn't guaranteed to be
// applied here, so the few brand tokens are inlined to keep it on-brand even in a hard failure.
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("global error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "linear-gradient(180deg,#1c140b,#130d07 50%,#0c0905)",
          color: "#f7efe2",
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "grid",
          placeItems: "center",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <svg width="40" height="40" viewBox="0 0 28 28" fill="none" style={{ marginBottom: 14 }} aria-hidden>
            <path d="M2 24 L10 7 L15 15 L18 10 L26 24 Z" fill="#fb7a3c" />
          </svg>
          <h1 style={{ fontSize: 24, margin: "0 0 8px", fontWeight: 600 }}>The climb stalled</h1>
          <p style={{ color: "#a89a82", fontSize: 15, lineHeight: 1.5, margin: "0 0 22px" }}>
            Cumbre hit an unexpected error. Your credits are safe. Please try again.
          </p>
          {error.digest && (
            <p style={{ fontFamily: "monospace", fontSize: 11, color: "#7f7259", marginBottom: 16 }}>ref {error.digest}</p>
          )}
          <button
            onClick={() => reset()}
            style={{
              width: "100%",
              maxWidth: 240,
              padding: "14px 20px",
              borderRadius: 14,
              border: 0,
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
              color: "#1a1205",
              background: "linear-gradient(135deg,#e8552d,#fb7a3c,#f6c64a)",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
