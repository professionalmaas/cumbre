// Cumbre wordmark + peak mark (docs/design_v2). Inline SVG, ember→gold gradient.
export function PeakMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden>
      <path d="M2 24 L10 7 L15 15 L18 10 L26 24 Z" fill="url(#pk)" />
      <path d="M10 7 l2.6 5 -2.6 1.4 -2.1 -1.1z" fill="#fff" opacity=".92" />
      <defs>
        <linearGradient id="pk" x1="0" y1="28" x2="28" y2="0">
          <stop offset="0" stopColor="#e8552d" />
          <stop offset=".5" stopColor="#fb7a3c" />
          <stop offset="1" stopColor="#f6c64a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <PeakMark />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: "3px",
          textTransform: "uppercase",
        }}
      >
        Cumbre
      </span>
    </div>
  );
}
