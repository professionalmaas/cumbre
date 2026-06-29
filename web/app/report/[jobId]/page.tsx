import { redirect, notFound } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { getJobForUser, getReportForUser, getFeedbackForUser, getShareToken } from "@/lib/queries";
import { Analyzing } from "@/components/Analyzing";
import { ReportClient } from "@/components/report/ReportClient";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: { jobId: string } }) {
  const user = await getUser();
  if (!user) redirect("/login");

  const job = await getJobForUser(params.jobId, user.sub);
  if (!job) notFound();

  if (job.status !== "done") {
    return <Analyzing status={job.status} stage={job.stage} />;
  }

  const report = await getReportForUser(params.jobId, user.sub);
  if (!report) {
    // Marked done but the report row hasn't propagated yet — keep polling.
    return <Analyzing status="running" stage="deliver" />;
  }

  const [feedback, shareToken] = await Promise.all([
    getFeedbackForUser(params.jobId, user.sub),
    getShareToken(params.jobId, user.sub),
  ]);

  return (
    <ReportClient
      report={report}
      jobId={params.jobId}
      filename={job.original_filename}
      feedback={feedback}
      shareToken={shareToken}
    />
  );
}
