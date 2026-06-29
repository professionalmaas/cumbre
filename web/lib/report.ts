// Analysis report contract — mirrors docs/analysis-contract.json (`response`).
// The worker (worker/cumbre_report.py) returns exactly this shape; the Report screen
// renders only from these fields.

export type Band = "base camp" | "ascending" | "summit";
export type Readiness = "not yet" | "close" | "ready";
export type Lens = "listener" | "producer" | "ar";
export type Depth = "fast" | "deep";
export type ImpactArea = "Music" | "Lyrics" | "Mix";

export interface AnalysisReport {
  song: {
    title: string;
    artistName: string;
    genre: string;
    key: string;
    tempoBpm: number;
    durationSec: number;
    timeSignature: string;
  };
  review: { lens: Lens; depth: Depth };
  scores: {
    overall: number;
    band: Band;
    music: number;
    lyrics: number;
    verdict: string;
  };
  marketFit: {
    genre: string;
    you: number;
    genreAvg: number;
    chartReady: number;
    pointsToChartReady: number;
  };
  readiness: { playlist: Readiness; radio: Readiness; sync: Readiness };
  structure: {
    sections: { label: string; energy: number }[];
    peakIndex: number;
    liftIndex: number;
  };
  highlight: { startSec: number; endSec: number; label: string };
  keep: { title: string; note: string }[];
  fixes: { rank: number; title: string; note: string; impact: { points: number; area: ImpactArea } }[];
  subscores: {
    music: { label: string; value: number }[];
    lyrics: { label: string; value: number }[];
  };
  mix: {
    lufs: number;
    lufsTarget: number;
    dynamicRange: number;
    truePeakDb: number;
    stereoWidthPct: number;
    note: string;
  };
  comparables: { artists: string[]; playlists: string[]; audience: string };
  features: {
    key: string;
    tempoBpm: number;
    energy: number;
    danceability: number;
    valence: number;
    loudnessDb: number;
    timeSignature: string;
    durationSec: number;
  };
}

export function bandLabel(band: Band): string {
  return band === "summit" ? "SUMMIT" : band === "ascending" ? "ASCENDING" : "BASE CAMP";
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Sample report (the contract's "Higher Ground" example) — used for local QA at /report/sample
// and as the two example cards on the entry screen.
export const SAMPLE_REPORT: AnalysisReport = {
  song: { title: "Higher Ground", artistName: "you", genre: "Indie Pop", key: "F# minor", tempoBpm: 122, durationSec: 204, timeSignature: "4/4" },
  review: { lens: "ar", depth: "deep" },
  scores: { overall: 78, band: "ascending", music: 82, lyrics: 74, verdict: "Strong bones, real altitude. Three clean moves put you on the summit." },
  marketFit: { genre: "Indie Pop", you: 78, genreAvg: 71, chartReady: 82, pointsToChartReady: 4 },
  readiness: { playlist: "ready", radio: "close", sync: "ready" },
  structure: {
    sections: [
      { label: "Intro", energy: 0.25 },
      { label: "V1", energy: 0.45 },
      { label: "Pre", energy: 0.6 },
      { label: "Chorus1", energy: 0.85 },
      { label: "V2", energy: 0.5 },
      { label: "Chorus2", energy: 0.8 },
      { label: "Bridge", energy: 0.55 },
      { label: "Outro", energy: 0.3 },
    ],
    peakIndex: 3,
    liftIndex: 5,
  },
  highlight: { startSec: 108, endSec: 132, label: "2nd chorus" },
  keep: [
    { title: "The hook is sticky.", note: "The chorus melody is instantly singable — your strongest hold on the wall." },
    { title: "Production sits pro.", note: "Clean low end and a present vocal — this already reads radio-grade." },
    { title: "Real emotional pull.", note: "Verse 1 lands honest and unforced — don't over-polish it." },
  ],
  fixes: [
    { rank: 1, title: "Lift the second chorus", note: "The summit chorus lands at the same height as the first. Stack a harmony or octave vocal so the peak actually feels higher.", impact: { points: 6, area: "Music" } },
    { rank: 2, title: "Anchor verse 2's imagery", note: "Lines 3–4 drift abstract. Tie them to one concrete image and the story pulls climbers all the way in.", impact: { points: 5, area: "Lyrics" } },
    { rank: 3, title: "Carve space in the low-mids", note: "200–400 Hz is crowded. Trim the rhythm guitar a couple dB so the vocal can breathe on the climb.", impact: { points: 4, area: "Mix" } },
  ],
  subscores: {
    music: [
      { label: "Hook strength", value: 84 },
      { label: "Production", value: 86 },
      { label: "Melody", value: 80 },
      { label: "Groove", value: 82 },
      { label: "Mix balance", value: 76 },
    ],
    lyrics: [
      { label: "Rhyme craft", value: 79 },
      { label: "Imagery", value: 76 },
      { label: "Emotional pull", value: 75 },
      { label: "Memorability", value: 73 },
      { label: "Story", value: 70 },
    ],
  },
  mix: { lufs: -7.2, lufsTarget: -14, dynamicRange: 8, truePeakDb: -0.8, stereoWidthPct: 78, note: "Your master is ~7 dB louder than Spotify's −14 LUFS target, so it'll be turned down on playback. Pull the limiter back for more punch and breathing room." },
  comparables: { artists: ["Novo Amor", "Local Natives", "Lord Huron"], playlists: ["Indie Chill", "Atmospheric Mornings", "Late-Night Drives"], audience: "25–34 · US · UK · AU" },
  features: { key: "F# minor", tempoBpm: 122, energy: 0.71, danceability: 0.64, valence: 0.42, loudnessDb: -7.2, timeSignature: "4/4", durationSec: 204 },
};
