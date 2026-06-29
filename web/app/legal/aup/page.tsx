import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { LegalFooter } from "@/components/LegalFooter";

// TEMPLATE — have counsel review before public launch.
export const metadata: Metadata = {
  title: "Acceptable Use Policy · Cumbre",
  description:
    "Cumbre Acceptable Use Policy: upload only audio you have the rights to, no abuse, and no reverse-engineering of the model or service.",
  alternates: { canonical: "/legal/aup" },
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

export default function AupPage() {
  return (
    <main className="frame">
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/legal" className="btn-ghost" style={{ width: 36, height: 36, padding: 0, borderRadius: 999 }}>
          ‹
        </Link>
        <Brand />
      </header>

      <p
        style={{
          marginTop: 18,
          padding: "8px 12px",
          border: "1px dashed var(--line-strong)",
          borderRadius: 8,
          color: "var(--faint)",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
        }}
      >
        TEMPLATE — have counsel review before public launch.
      </p>

      <div className="eyebrow" style={{ marginTop: 20 }}>
        Ground rules
      </div>
      <h1 className="serif" style={{ fontSize: 30, margin: "8px 0 4px" }}>
        Acceptable Use Policy
      </h1>
      <p style={{ color: "var(--faint)", fontSize: 12 }}>
        Last updated {new Date().getFullYear()}. This policy is part of your agreement with [LEGAL
        ENTITY] (&quot;Cumbre&quot;) and supplements the{" "}
        <Link href="/legal/terms" style={{ textDecoration: "underline", color: "var(--muted)" }}>
          Terms of Service
        </Link>
        . Violating it may result in suspension or termination.
      </p>

      <Section title="Upload only what you have the rights to">
        Only upload audio you own or otherwise control all necessary rights to. Do not upload anyone
        else&apos;s recording or composition without authorization. Cumbre ingests audio by upload
        only — never submit links or attempt to have us fetch audio from YouTube, Spotify, or other
        services.
      </Section>

      <Section title="No abuse">
        Do not use Cumbre to: harass, defame, or harm others; upload unlawful, infringing, or
        malicious content; attempt to disrupt, overload, or gain unauthorized access to the service
        or other accounts; scrape or bulk-extract content; circumvent usage limits, credits, or
        billing; or use automated means to access the service except as we expressly permit.
      </Section>

      <Section title="No reverse-engineering">
        Do not reverse-engineer, decompile, disassemble, probe, or otherwise attempt to derive the
        Cumbre model, scoring methodology, rubrics, prompts, or report format, and do not use the
        service to build or train a competing product. The scoring system and report structure are
        proprietary trade secrets.
      </Section>

      <Section title="Enforcement">
        We may investigate suspected violations, remove content, and suspend or terminate accounts.
        Serious or repeated violations — including repeat copyright infringement under our{" "}
        <Link href="/legal/dmca" style={{ textDecoration: "underline", color: "var(--muted)" }}>
          DMCA policy
        </Link>{" "}
        — will result in termination. Report abuse to [DMCA AGENT NAME/EMAIL].
      </Section>

      <LegalFooter />
    </main>
  );
}
