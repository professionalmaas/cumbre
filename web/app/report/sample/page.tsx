import { ReportView } from "@/components/report/ReportView";
import { SAMPLE_REPORT } from "@/lib/report";

// Public sample render of the Report screen (the contract's "Higher Ground" example).
// Used to preview/QA the design locally without a live backend.
export default function SampleReportPage() {
  return <ReportView report={SAMPLE_REPORT} filename={SAMPLE_REPORT.song.title} audioUrl={null} />;
}
