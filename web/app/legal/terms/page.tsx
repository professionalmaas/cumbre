import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { LegalFooter } from "@/components/LegalFooter";

// TEMPLATE — have counsel review before public launch.
export const metadata: Metadata = {
  title: "Terms of Service · Cumbre",
  description:
    "Cumbre Terms of Service: subscription terms, refunds, your rights warranty, the no-guarantee-of-success disclaimer, and limitation of liability.",
  alternates: { canonical: "/legal/terms" },
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

export default function TermsPage() {
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
        The agreement
      </div>
      <h1 className="serif" style={{ fontSize: 30, margin: "8px 0 4px" }}>
        Terms of Service
      </h1>
      <p style={{ color: "var(--faint)", fontSize: 12 }}>
        Last updated {new Date().getFullYear()}. These Terms are a binding agreement between you and
        [LEGAL ENTITY] (&quot;Cumbre,&quot; &quot;we,&quot; &quot;us&quot;). By creating an account or
        uploading a track you agree to them.
      </p>

      <Section title="1. What Cumbre provides">
        Cumbre is an AI song-craft grading service. You upload a recording and we return a two-part,
        genre-aware <b>craft grade</b> (Music and Lyrics) plus a short list of suggested fixes. The
        output is <b>craft feedback only</b> — it is informational and educational and is not
        professional A&amp;R, mixing/mastering, legal, or financial advice.
      </Section>

      <Section title="2. Plans, billing &amp; auto-renewal">
        We offer two plans:
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>
            <b>Summit Pass — $9</b>, a one-time charge that grants one analysis (one credit).
          </li>
          <li>
            <b>Season Pass — $19/month</b>, a subscription granting unlimited analyses while active.
          </li>
        </ul>
        <p style={{ marginTop: 10 }}>
          The Season Pass <b>renews automatically</b> each month at the then-current price until you
          cancel, and your payment method is charged at the start of each period. You can{" "}
          <b>cancel anytime</b> from your account&apos;s billing portal; cancellation stops future
          renewals and access continues through the end of the paid period. Payments are processed by
          Stripe; we never see or store your full card details.
        </p>
      </Section>

      <Section title="3. Refunds">
        Summit and Season charges are generally <b>non-refundable</b> once an analysis has been
        delivered, because the service is rendered at that point. We do not charge for an analysis
        that fails our moderation/originality checks before delivery. If you believe you were charged
        in error, contact us at [DMCA AGENT NAME/EMAIL] within 14 days and we will review the request
        in good faith. Chargebacks/disputes may result in immediate suspension of access pending
        review.
      </Section>

      <Section title="4. Your rights warranty">
        You may upload <b>only</b> audio that you own or otherwise control all necessary rights to.
        By uploading, you represent and warrant that you hold the rights to the recording and any
        underlying composition, and that our processing of it will not infringe any third party&apos;s
        rights. You grant Cumbre a narrow, temporary license to process the file solely to produce
        your report. You retain all ownership of your music. We never pull audio from YouTube,
        Spotify, or other URLs — upload is the only ingestion path.
      </Section>

      <Section title="5. Grades are craft feedback — not a guarantee">
        Cumbre&apos;s scores reflect craft versus genre norms only. <b>They are not a guarantee or
        prediction of commercial success, chart placement, streams, or revenue, and no
        hit-probability or &quot;% chance of success&quot; is implied or provided.</b> Any decision you
        make based on the feedback is yours alone.
      </Section>

      <Section title="6. Acceptable use">
        Your use is also governed by our{" "}
        <Link href="/legal/aup" style={{ textDecoration: "underline", color: "var(--muted)" }}>
          Acceptable Use Policy
        </Link>
        , including the prohibition on reverse-engineering or copying the scoring methodology. We may
        suspend or terminate accounts that violate these Terms or the AUP, or that are subject to
        repeat infringement under our{" "}
        <Link href="/legal/dmca" style={{ textDecoration: "underline", color: "var(--muted)" }}>
          DMCA policy
        </Link>
        .
      </Section>

      <Section title="7. Intellectual property">
        The Cumbre name, the summit scoring system, the genre rubrics, the report structure and copy,
        the prompts, and the underlying models and software are proprietary and protected by copyright
        and trade-secret law. You may not scrape, reverse-engineer, bulk-extract, or reproduce the
        methodology or report format to build a competing product.
      </Section>

      <Section title="8. Disclaimers &amp; limitation of liability">
        The service is provided <b>&quot;as is&quot; and &quot;as available,&quot;</b> without
        warranties of any kind. To the maximum extent permitted by law, [LEGAL ENTITY] will not be
        liable for any indirect, incidental, special, consequential, or punitive damages, or for any
        decisions you make based on the feedback. Our total aggregate liability for any claim is
        limited to the amount you paid us in the 12 months before the claim.
      </Section>

      <Section title="9. Governing law">
        These Terms are governed by the laws of [GOVERNING LAW JURISDICTION], without regard to its
        conflict-of-laws rules.
      </Section>

      <Section title="10. Dispute resolution / arbitration">
        [DISPUTE RESOLUTION &amp; ARBITRATION CLAUSE — e.g. binding individual arbitration, venue,
        class-action waiver, and any opt-out window — to be drafted by counsel for the chosen
        jurisdiction.]
      </Section>

      <Section title="11. Changes & contact">
        We may update these Terms; material changes will be posted here with a new &quot;last
        updated&quot; date and, where required, notified to you. Questions:{" "}
        [DMCA AGENT NAME/EMAIL], [LEGAL ENTITY], [ADDRESS].
      </Section>

      <LegalFooter />
    </main>
  );
}
