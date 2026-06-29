import Link from "next/link";

// Very small print: hover for the short version (native title tooltip), click for the full
// terms. Protects Cumbre's proprietary methodology + the AI-feedback / no-guarantee disclaimers.
const SHORT =
  "© Cumbre. Scores, the summit methodology, and the report format are proprietary and protected. " +
  "AI craft feedback — informational only, not professional A&R advice, and not a prediction of " +
  "commercial success. Your audio is analyzed then deleted; lyrics are never stored or displayed.";

export function LegalFooter() {
  return (
    <p
      title={SHORT}
      style={{
        textAlign: "center",
        color: "var(--faint2, #6f6450)",
        fontSize: 10,
        lineHeight: 1.6,
        marginTop: 20,
        cursor: "help",
      }}
    >
      © {new Date().getFullYear()} Cumbre · proprietary scoring &amp; methodology · AI feedback, not
      A&amp;R advice, no guarantee · audio deleted after analysis ·{" "}
      <Link href="/legal" style={{ textDecoration: "underline", color: "var(--muted)" }}>
        full terms
      </Link>
    </p>
  );
}
