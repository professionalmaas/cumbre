import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { LegalFooter } from "@/components/LegalFooter";

// TODO(legal): a DMCA designated agent legally needs a physical mailing address AND registration
// with the US Copyright Office (dmca.copyright.gov). Interim copy uses the email agent contact;
// add the registered mailing address + complete the Copyright Office registration before scale.
export const metadata: Metadata = {
  title: "Copyright / DMCA Policy · Cumbre",
  description:
    "Cumbre's DMCA policy: how to file a takedown notice, the counter-notice process, our designated agent, and our repeat-infringer termination policy.",
  alternates: { canonical: "/legal/dmca" },
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

export default function DmcaPage() {
  return (
    <main className="frame">
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/legal" className="btn-ghost" aria-label="Back to legal overview" style={{ width: 36, height: 36, padding: 0, borderRadius: 999 }}>
          ‹
        </Link>
        <Brand />
      </header>

      <div className="eyebrow" style={{ marginTop: 20 }}>
        Copyright
      </div>
      <h1 className="serif" style={{ fontSize: 30, margin: "8px 0 4px" }}>
        Copyright &amp; DMCA Policy
      </h1>
      <p style={{ color: "var(--faint)", fontSize: 12 }}>
        Last updated July 1, 2026. Professional MAAS LLC (&quot;Cumbre&quot;) respects
        intellectual property and responds to valid notices under the Digital Millennium Copyright Act
        (DMCA). Cumbre requires uploaders to warrant they own or control the rights to their audio and
        runs an automated originality (fingerprint) check before any result is delivered.
      </p>

      <Section title="Designated agent">
        Send copyright notices to our designated agent:
        <p style={{ marginTop: 8 }}>
          DMCA Agent — Professional MAAS LLC
          <br />
          legal@getcumbre.com
        </p>
      </Section>

      <Section title="Filing a takedown notice">
        A valid notice must be in writing and include all of the following:
        <ol style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>Your physical or electronic signature.</li>
          <li>Identification of the copyrighted work you claim was infringed.</li>
          <li>
            Identification of the material claimed to be infringing and information reasonably
            sufficient for us to locate it (e.g. the account, song, or report).
          </li>
          <li>Your contact information (name, address, telephone, email).</li>
          <li>
            A statement that you have a good-faith belief the use is not authorized by the copyright
            owner, its agent, or the law.
          </li>
          <li>
            A statement, under penalty of perjury, that the information in the notice is accurate and
            that you are the owner or authorized to act on the owner&apos;s behalf.
          </li>
        </ol>
        <p style={{ marginTop: 10 }}>
          On receipt of a valid notice we will act expeditiously to remove or disable access to the
          identified material and, where appropriate, notify the affected user.
        </p>
      </Section>

      <Section title="Counter-notice">
        If you believe material was removed by mistake or misidentification, you may send a
        counter-notice to our designated agent including: your signature; identification of the
        material and its prior location; a statement under penalty of perjury that you have a
        good-faith belief the material was removed by mistake or misidentification; your name,
        address, and phone; and a statement consenting to the jurisdiction of the appropriate court
        and to accept service of process from the complaining party. We may restore the material in
        10–14 business days unless the complaining party files a court action.
      </Section>

      <Section title="Repeat-infringer policy">
        Cumbre enforces a repeat-infringer policy: accounts that are the subject of repeated valid
        infringement notices, or that we otherwise determine to be repeat infringers, will be{" "}
        <b>suspended or terminated</b>. Submitting false notices or counter-notices may incur
        liability under the DMCA.
      </Section>

      <LegalFooter />
    </main>
  );
}
