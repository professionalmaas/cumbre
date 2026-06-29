"use client";

import { useEffect, useState } from "react";
import { getAudio } from "@/lib/audioStore";
import { ReportView } from "@/components/report/ReportView";
import type { AnalysisReport } from "@/lib/report";
import type { FeedbackTarget, FeedbackVote } from "@/lib/queries";

export type FeedbackRow = { target: FeedbackTarget; rank: number | null; vote: FeedbackVote };

// Reads the in-session audio object URL (set at upload) so the highlight can play
// without the server ever storing audio. Absent on hard reload -> playback disabled.
export function ReportClient({
  report,
  jobId,
  filename,
  feedback = [],
  shareToken = null,
}: {
  report: AnalysisReport;
  jobId: string;
  filename?: string | null;
  feedback?: FeedbackRow[];
  shareToken?: string | null;
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  useEffect(() => {
    setAudioUrl(getAudio(jobId));
  }, [jobId]);
  return (
    <ReportView
      report={report}
      filename={filename}
      audioUrl={audioUrl}
      jobId={jobId}
      feedback={feedback}
      shareToken={shareToken}
    />
  );
}
