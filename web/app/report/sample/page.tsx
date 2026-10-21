import { ReportView } from "@/components/report/ReportView";
import { SAMPLE_REPORT } from "@/lib/report";

// Public sample render of the Report screen. The highlight uses the short original
// demo clip so the play control works without a user upload.
export default function SampleReportPage() {
  const report = {
    ...SAMPLE_REPORT,
    song: { ...SAMPLE_REPORT.song, title: "Ridge Line", durationSec: 8 },
    highlight: { startSec: 0.4, endSec: 6, label: "demo peak" },
  };
  return <ReportView report={report} filename={report.song.title} audioUrl="/samples/ridge.wav" />;
}
