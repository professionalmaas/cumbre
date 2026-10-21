import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/Brand";

// Static legal page — no session read, so no force-dynamic; safe to statically render.
export const metadata: Metadata = {
  title: "Terms, Privacy & IP · Cumbre",
  description:
    "Plain-English summary of Cumbre's terms, privacy, and intellectual-property policy: AI craft feedback only, audio deleted after analysis, lyrics never stored.",
  alternates: { canonical: "/legal" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 className="serif" style={{ fontSize: 19, margin: "0 0 8px" }}>
        {title}
      </h2>
      <div style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}

// Full legal detail reached from the small-print footer. Plain-English summary; the binding
// Sample policy copy for the portfolio demo. Not a live service and not legal advice.
export default function LegalPage() {
  return (
    <main className="frame">
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/" className="btn-ghost" aria-label="Back to home" style={{ width: 36, height: 36, padding: 0, borderRadius: 999 }}>
          ‹
        </Link>
        <Brand />
      </header>

      <div className="eyebrow" style={{ marginTop: 24 }}>
        The fine print
      </div>
      <h1 className="serif" style={{ fontSize: 30, margin: "8px 0 4px" }}>
        Terms, Privacy &amp; IP
      </h1>
      <p style={{ color: "var(--faint)", fontSize: 12 }}>
        Last updated July 1, 2026. This is a plain-English summary; the binding ToS, Privacy Policy,
        DMCA policy, and Acceptable Use Policy are the linked subpages below.
      </p>

      <nav
        style={{
          marginTop: 18,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {[
          { href: "/legal/terms", label: "Terms of Service" },
          { href: "/legal/privacy", label: "Privacy Policy" },
          { href: "/legal/dmca", label: "Copyright / DMCA" },
          { href: "/legal/aup", label: "Acceptable Use" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="btn-ghost"
            style={{ fontSize: 12, padding: "7px 12px", borderRadius: 999 }}
          >
            {l.label} →
          </Link>
        ))}
      </nav>

      <Section title="What Cumbre is — and isn't">
        Cumbre gives <b>AI-generated craft feedback</b> to help you improve a song. It is
        informational and educational. It is <b>not</b> professional A&amp;R advice, not a guarantee
        or prediction of commercial success, chart placement, streams, or revenue, and not a
        substitute for professional mixing/mastering or legal/financial advice. Scores reflect craft
        versus genre norms only.
      </Section>

      <Section title="Your audio &amp; your rights">
        You may upload <b>only</b> recordings you own or control the rights to, and you grant Cumbre a
        narrow, temporary license to process the file solely to produce your report. We analyze your
        track and then <b>delete the audio</b> — we keep derived scores/metrics, never the audio
        file, and we never store or display your lyrics. We never pull audio from YouTube, Spotify,
        or other URLs.
      </Section>

      <Section title="Our intellectual property (please don't copy)">
        The Cumbre name, the summit scoring system, the genre rubrics, the report structure and
        copy, the prompts, and the underlying models and software are <b>proprietary</b> and
        protected by copyright and trade-secret law. The sample reports are deliberately partial.
        Scraping, reverse-engineering, bulk-extracting, or reproducing the scoring methodology or
        report format to build a competing product is prohibited. You keep ownership of your music;
        we keep ownership of the analysis system.
      </Section>

      <Section title="Payments">
        Summit Pass is a one-time charge for one analysis; Season Pass is a recurring subscription
        for unlimited analyses, billed monthly via Stripe until canceled. Charges occur only after a
        successful, clean analysis. Refunds/disputes are reviewed case by case.
      </Section>

      <Section title="Copyright &amp; DMCA">
        Cumbre respects intellectual property and enforces a repeat-infringer policy. If you believe
        content was processed in violation of your rights, contact our DMCA agent at demo@example.com. We
        run an automated originality (fingerprint) check and route suspected matches to human review
        before any result is delivered.
      </Section>

      <Section title="Privacy">
        We store your account (via Cognito), your derived scores/metrics, and your song log — not
        your audio or lyrics. Payment data is handled by Stripe; we don't see your card details. See
        the full Privacy Policy for retention, cookies, and your data-deletion rights.
      </Section>

      <Section title="Liability">
        Cumbre is provided "as is." To the maximum extent permitted by law, the Cumbre demo is not liable
        for decisions you make based on the feedback, or for any indirect or consequential damages.
      </Section>

      <p style={{ color: "var(--faint)", fontSize: 11, marginTop: 26 }}>
        Questions? demo@example.com. © {new Date().getFullYear()} Cumbre. All rights reserved.
      </p>
    </main>
  );
}
