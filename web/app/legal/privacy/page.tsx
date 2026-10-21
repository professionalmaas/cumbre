import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { LegalFooter } from "@/components/LegalFooter";

// Sample policy copy for the portfolio demo. Not a live service and not legal advice.
export const metadata: Metadata = {
  title: "Privacy Policy · Cumbre",
  description:
    "Cumbre Privacy Policy: what we collect, our promise that uploaded audio is deleted after analysis and lyrics are never stored, our sub-processors, retention, and your data rights.",
  alternates: { canonical: "/legal/privacy" },
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

export default function PrivacyPage() {
  return (
    <main className="frame">
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/legal" className="btn-ghost" aria-label="Back to legal overview" style={{ width: 36, height: 36, padding: 0, borderRadius: 999 }}>
          ‹
        </Link>
        <Brand />
      </header>

      <div className="eyebrow" style={{ marginTop: 20 }}>
        Your data
      </div>
      <h1 className="serif" style={{ fontSize: 30, margin: "8px 0 4px" }}>
        Privacy Policy
      </h1>
      <p style={{ color: "var(--faint)", fontSize: 12 }}>
        Last updated July 1, 2026. This explains what the Cumbre demo (&quot;Cumbre&quot;)
        collects, why, and your choices. This is sample copy. The local demo does not send your audio anywhere.
      </p>

      <Section title="Our core promise">
        <p
          style={{
            margin: 0,
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--warm)",
            color: "var(--ink)",
          }}
        >
          <b>Your uploaded audio is deleted after analysis, and your lyrics are never stored.</b> We
          keep the derived scores and feature metrics — never the audio file, and never verbatim
          lyric text.
        </p>
      </Section>

      <Section title="What we collect">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Email address</b> — for your account, via our identity provider (AWS Cognito).
          </li>
          <li>
            <b>Uploaded audio</b> — the recording you submit, processed transiently and then deleted
            (see retention).
          </li>
          <li>
            <b>Derived feature vectors &amp; scores</b> — the numeric audio/lyric metrics and the
            resulting grade and report, which we retain.
          </li>
          <li>
            <b>Stripe customer id &amp; billing status</b> — to manage your purchase or subscription
            (we do not store card numbers).
          </li>
          <li>
            <b>Basic usage/diagnostic logs</b> — to operate and secure the service.
          </li>
        </ul>
      </Section>

      <Section title="How we use it">
        To produce your craft report, provide and bill the service, prevent abuse and copyright
        infringement (an automated originality check runs before delivery), improve our models in
        aggregate using <b>derived metrics</b> (never your audio or lyrics), and meet legal
        obligations.
      </Section>

      <Section title="Sub-processors">
        We share the minimum data necessary with vetted processors:
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>
            <b>Amazon Web Services (AWS)</b> — hosting, storage, and Cognito identity.
          </li>
          <li>
            <b>Stripe</b> — payments and subscription billing.
          </li>
          <li>
            <b>Anthropic</b> — LLM-assisted lyric/craft feedback (derived inputs only).
          </li>
          <li>
            <b>OpenAI</b> — transcription/moderation of audio during processing (transient).
          </li>
          <li>
            <b>ACRCloud</b> — audio fingerprint / originality check.
          </li>
        </ul>
      </Section>

      <Section title="Retention">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Uploaded audio: ≤ 1 day</b> — deleted promptly after analysis completes.
          </li>
          <li>
            <b>Lyrics / transcripts:</b> never stored; transient and per-user during processing only.
          </li>
          <li>
            <b>Derived metrics, scores &amp; reports:</b> retained while your account is active, so
            your summit log persists, until you request deletion.
          </li>
          <li>
            <b>Account &amp; billing records:</b> retained as required for tax/accounting and fraud
            prevention.
          </li>
        </ul>
      </Section>

      <Section title="Your rights">
        Subject to applicable law, you may request to <b>access</b>, <b>export</b>, <b>correct</b>, or{" "}
        <b>delete</b> your personal data, and object to or restrict certain processing. To make a
        request, email demo@example.com from your account email; we will verify and respond
        within the timeframe the law requires. Deleting your account removes your derived metrics and
        report history (records we must keep for legal reasons excepted).
      </Section>

      <Section title="Lawful basis">
        Where required (e.g. GDPR/UK GDPR), we rely on: <b>performance of a contract</b> (to deliver
        the analysis you purchased), <b>legitimate interests</b> (securing the service, preventing
        abuse, improving models with derived data), <b>consent</b> (where specifically requested), and{" "}
        <b>legal obligation</b> (tax, accounting, responding to lawful requests).
      </Section>

      <Section title="Contact">
        Privacy questions or requests: demo@example.com (the Cumbre demo).
      </Section>

      <LegalFooter />
    </main>
  );
}
