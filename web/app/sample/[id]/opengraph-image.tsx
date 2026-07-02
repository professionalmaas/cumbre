import { ImageResponse } from "next/og";
import { ScoreCardOg } from "@/components/og/ScoreCardOg";
import { SAMPLE_TEASERS } from "@/lib/samples";
import { bandLabel } from "@/lib/report";

// Per-sample OG score card — social shares of /sample/[id] show the actual score/badge
// instead of the generic site card (the score card IS the growth loop). Unknown ids degrade
// to a generic branded card rather than 404, so link previews never break.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Cumbre sample route report score card";

// Same Windows build gotcha as app/opengraph-image.tsx: the bundled @vercel/og asset loader
// fails during build-time prerender here — defer to request time (when crawlers fetch anyway).
export const dynamic = "force-dynamic";

export default function SampleOgImage({ params }: { params: { id: string } }) {
  const t = SAMPLE_TEASERS[params.id];

  if (!t) {
    return new ImageResponse(
      (
        <ScoreCardOg
          title="Get your song to the summit"
          subtitle="A genre-aware, fame-blind craft grade + your Top 3 fixes"
          bandLabel="CUMBRE"
          kicker="AI SONG COACH"
        />
      ),
      { ...size }
    );
  }

  return new ImageResponse(
    (
      <ScoreCardOg
        title={t.title}
        subtitle={`${t.artist} · ${t.genre}`}
        score={t.score}
        bandLabel={bandLabel(t.band)}
      />
    ),
    { ...size }
  );
}
