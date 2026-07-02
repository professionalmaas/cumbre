import Link from "next/link";

// Small print. The full terms used to be hidden in a native title= tooltip, which is
// invisible to keyboard and touch users; we now show a concise, visible disclosure line and
// link the details to /legal. Protects Cumbre's proprietary methodology + the AI-feedback /
// no-guarantee disclaimers.
export function LegalFooter() {
  return (
    <p
      style={{
        textAlign: "center",
        color: "var(--faint2, #8f8168)",
        fontSize: 10,
        lineHeight: 1.6,
        marginTop: 20,
      }}
    >
      © {new Date().getFullYear()} Cumbre · proprietary scoring &amp; methodology · AI feedback, not
      A&amp;R advice, no guarantee · audio deleted after analysis ·{" "}
      <Link href="/plans#faq" style={{ textDecoration: "underline", color: "var(--muted)" }}>
        FAQ
      </Link>{" "}
      ·{" "}
      <Link href="/legal" style={{ textDecoration: "underline", color: "var(--muted)" }}>
        full terms
      </Link>
    </p>
  );
}
