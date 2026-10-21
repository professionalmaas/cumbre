// Deliberately PARTIAL sample data for the public teasers. Shows enough to convey value
// (gauge, band, verdict, one fix headline, two subscores) but withholds the full fix notes,
// the complete subscore set, mix metrics, comparables, and the methodology — so a competitor
// can't reconstruct the product from the public page. The real report is paid + per-user.
export interface SampleTeaser {
  id: string;
  title: string;
  artist: string;
  genre: string;
  score: number;
  band: "base camp" | "ascending" | "summit";
  music: number;
  lyrics: number;
  verdict: string;
  topFixTitle: string; // headline only — the actionable note is locked
  shownSubscores: { label: string; value: number }[]; // a small, non-exhaustive slice
  lockedCount: number; // how many more insights are behind the paywall
}

export const SAMPLE_TEASERS: Record<string, SampleTeaser> = {
  ridge: {
    id: "ridge",
    title: "Ridge Line",
    artist: "Cumbre demo",
    genre: "Pop",
    score: 81,
    band: "summit",
    music: 84,
    lyrics: 77,
    verdict: "A summit-grade hook and a mix that translates everywhere — small wins left up top.",
    topFixTitle: "Tighten the pre-chorus lift",
    shownSubscores: [
      { label: "Hook strength", value: 88 },
      { label: "Production", value: 85 },
    ],
    lockedCount: 11,
  },
  lantern: {
    id: "lantern",
    title: "Lantern Pocket",
    artist: "Cumbre demo",
    genre: "Hip-Hop",
    score: 66,
    band: "ascending",
    music: 70,
    lyrics: 63,
    verdict: "Strong pocket and presence — the back half needs one more lift to summit.",
    topFixTitle: "Re-energize the final third",
    shownSubscores: [
      { label: "Groove", value: 79 },
      { label: "Flow", value: 71 },
    ],
    lockedCount: 12,
  },
};
