// Shared types mirroring supabase/schema.sql and the engine report contract
// (docs/sample_report.json / ml/cumbre_scoring.py analyze_song output).

export type Genre = "pop" | "edm" | "hiphop";

export type JobStatus =
  | "queued"
  | "running"
  | "needs_review"
  | "done"
  | "failed"
  | "rejected";

export type ReviewCategory =
  | "copyright"
  | "moderation"
  | "low_confidence"
  | "ood"
  | "payment"
  | "drift";

export interface Job {
  id: string;
  song_id: string;
  user_id: string;
  status: JobStatus;
  stage: string | null;
  model_version: string | null;
  confidence: number | null;
  flagged_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Song {
  id: string;
  user_id: string;
  storage_key: string;
  original_filename: string | null;
  genre: Genre;
  declared_year: number | null;
  rights_warranty: boolean;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  job_id: string;
  category: ReviewCategory;
  payload: unknown;
  created_at: string;
}

// --- Engine report shape (subset we render; see docs/sample_report.json) ---

export interface EngineReport {
  summit_score: number;
  grade: string;
  summit_phrase: string;
  music_score: number;
  lyrics_score: number | null;
  genre: Genre;
  lyrics_weight: number;
  top_fixes: string[];
  music_subscores: Record<string, number>;
  lyrics_subscores: Record<string, number>;
  music_percentile?: number;
}

export interface AudioFeatures {
  duration_sec: number;
  tempo_bpm: number;
  time_signature: number;
  key: string;
  mode: number;
  loudness_db_rms: number;
  energy: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  valence: number;
  liveness: number;
  lufs_integrated: number;
  true_peak_dbtp: number;
  loudness_headroom_db: number;
  crest_factor_db: number;
  clipping_pct: number;
  stereo_correlation: number;
  intro_length_sec: number;
  n_sections: number;
  [k: string]: unknown;
}

// What worker/modal_app.py extract_and_score returns to the loop.
export interface WorkerResult {
  ok: boolean;
  reason?: string;
  report: EngineReport;
  features: AudioFeatures;
  fameblind: {
    score: number;
    threshold: number;
    above_threshold: boolean;
    model_version?: string;
  } | null;
  confidence: number;
  model_version: string | null;
}

// results table row (what the report page reads).
export interface Result {
  job_id: string;
  features: AudioFeatures | null;
  music_score: number | null;
  lyrics_score: number | null;
  combined_grade: string | null;
  subscores: {
    summit_score?: number;
    summit_phrase?: string;
    music_subscores?: Record<string, number>;
    lyrics_subscores?: Record<string, number>;
    music_percentile?: number;
    genre?: Genre;
  } | null;
  top_fixes: string[] | null;
  feedback_md: string | null;
  created_at: string;
}

// Credit packs offered at checkout. Stripe price ids come from env.
export interface CreditPack {
  id: string;
  label: string;
  credits: number;
  priceId: string | undefined;
}
