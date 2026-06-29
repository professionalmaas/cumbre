import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/Brand";
import { LegalFooter } from "@/components/LegalFooter";
import { getSharePublic } from "@/lib/queries";
import { bandLabel, type Band } from "@/lib/report";

export const dynamic = "force-dynamic";

// Public, shareable result. Exposes ONLY the summit score, band, song title and one-line
// verdict — never fixes, mix, comparables, features, or methodology. Drives virality while
// protecting the product. Unknown/expired tokens 404.

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const s = await getSharePublic(params.token);
  if (!s) return { title: "Cumbre — Get your song to the summit" };
  const title = `${s.overall} on Cumbre · ${bandLabel(s.band as Band)}`;
  const description = s.verdict || "An AI craft grade for an independent song. Grade your own.";
  const ogImage = `/share/${params.token}/opengraph-image`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: ogImage, width: 1200, height: 630 }], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const s = await getSharePublic(params.token);
  if (!s) notFound();

  const score = Math.round(s.overall);
  const band = s.band as Band;

  // mini tick gauge (same visual language as the sample teaser)
  const N = 40,
    cx = 110,
    cy = 96,
    r1 = 66,
    r2 = 88;
  const lit = Math.round((Math.max(0, Math.min(100, score)) / 100) * (N - 1));
  const f = (n: number) => n.toFixed(2);

  return (
    <main className="frame">
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Brand />
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: 2,
            color: "var(--muted)",
          }}
        >
          SHARED SUMMIT
        </span>
      </header>

      <div className="eyebrow" style={{ marginTop: 26 }}>
        A summit on Cumbre
      </div>
      <h1 className="serif" style={{ fontSize: 28, margin: "8px 0 14px" }}>
        {s.title}
      </h1>

      <div
        className="card"
        style={{ padding: "20px 18px 24px", textAlign: "center", background: "linear-gradient(180deg,var(--warm),rgba(255,255,255,0.02))" }}
      >
        <div style={{ position: "relative", width: 220, height: 120, margin: "0 auto" }}>
          <svg viewBox="0 0 220 110" width="220" height="110" role="img" aria-label={`Summit score ${score} out of 100, band ${bandLabel(band)}`}>
            {Array.from({ length: N }, (_, i) => {
              const a = Math.PI - (i / (N - 1)) * Math.PI;
              const on = i <= lit;
              const ti = i / (N - 1);
              return (
                <line
                  key={i}
                  x1={f(cx + r1 * Math.cos(a))}
                  y1={f(cy - r1 * Math.sin(a))}
                  x2={f(cx + r2 * Math.cos(a))}
                  y2={f(cy - r2 * Math.sin(a))}
                  stroke={on ? (ti < 0.5 ? "#e8552d" : "#f6c64a") : "rgba(246,198,74,0.10)"}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          <div style={{ position: "absolute", left: 0, right: 0, top: 48, textAlign: "center" }}>
            <div className="grad-text serif" style={{ fontSize: 48, fontWeight: 600, lineHeight: 1 }}>
              {score}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 3, color: "var(--amber)", marginTop: 2 }}>
              {bandLabel(band)}
            </div>
          </div>
        </div>
        {s.verdict && (
          <p className="serif" style={{ fontStyle: "italic", color: "var(--muted)", margin: "8px 12px 0", fontSize: 15 }}>
            “{s.verdict}”
          </p>
        )}
      </div>

      <div
        className="card"
        style={{ marginTop: 16, padding: "20px 18px", textAlign: "center", background: "linear-gradient(180deg,rgba(232,85,45,0.08),rgba(255,255,255,0.02))" }}
      >
        <div className="serif" style={{ fontSize: 19 }}>
          How high does <span className="grad-text" style={{ fontStyle: "italic" }}>your</span> song climb?
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "6px 0 0" }}>
          Cumbre scores your track and hands you the exact moves to the summit.
        </p>
      </div>

      <Link href="/" className="btn-primary" style={{ marginTop: 16 }}>
        Grade your own song →
      </Link>

      <LegalFooter />
    </main>
  );
}
