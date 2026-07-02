// FAQ for /plans (linked from the site footer). Native <details>/<summary> accordion —
// zero-JS, keyboard-accessible, SSR-friendly. Copy is bound to the real product: the genre
// list mirrors UploadForm's GENRES and the report contents mirror the AnalysisReport contract.
const FAQS: { q: string; a: string }[] = [
  {
    q: "Is my song stored or used to train AI?",
    a: "No. We analyze your track and then delete the audio — we keep the derived scores and metrics, never the file. Lyrics are analyzed for the grade but never stored or displayed.",
  },
  {
    q: "What genres are supported?",
    a: "Pop, Indie Pop, R&B / Soul, Hip-Hop, Electronic, Folk, Rock, and Country. Every score is measured against the norms of the genre you pick — a trap song isn't graded like a folk ballad.",
  },
  {
    q: "What do I actually get in a report?",
    a: "A 0–100 summit score with separate Music and Lyrics grades, your Top 3 fixes, an energy map of the song's structure, and a mix report. Plus what's already working — so you don't over-polish your strongest holds.",
  },
  {
    q: "What if my track fails moderation or originality checks?",
    a: "You're not charged. Those checks run before any money moves — payment only happens after a successful, clean analysis.",
  },
  {
    q: "Is this A&R advice or a hit predictor?",
    a: "Neither. Cumbre grades craft against genre norms — it never predicts commercial success, streams, or chart odds. Honest, specific feedback you can act on is the whole product.",
  },
];

export function PlansFaq() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <section id="faq" style={{ marginTop: 34 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="eyebrow">Questions at base camp</div>
      <h2 className="serif" style={{ fontSize: 22, margin: "8px 0 12px" }}>
        FAQ
      </h2>
      <div style={{ display: "grid", gap: 8 }}>
        {FAQS.map((f) => (
          <details key={f.q} className="card" style={{ padding: "4px 16px" }}>
            <summary
              style={{
                cursor: "pointer",
                padding: "12px 0",
                fontWeight: 600,
                fontSize: 14.5,
                listStyle: "none",
              }}
            >
              {f.q}
            </summary>
            <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.65, margin: "0 0 14px" }}>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
