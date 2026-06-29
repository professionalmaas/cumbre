import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { Depth, Lens } from "@/lib/report";

// Starts the `analyze` Step Functions execution for a job. The state machine runs the
// durable loop (validate → moderate → fingerprint → worker → charge → deliver).
const region = process.env.AWS_REGION ?? "us-east-1";
let _sfn: SFNClient | null = null;
function sfn(): SFNClient {
  if (!_sfn) _sfn = new SFNClient({ region });
  return _sfn;
}

export interface AnalyzeInput {
  jobId: string;
  userId: string;
  songId: string;
  genre: string;
  year: number;
  s3Key: string;
  depth: Depth;
  lens: Lens;
  chargeable: boolean; // false when an active Season subscription covers this analysis
}

export async function startAnalyze(input: AnalyzeInput): Promise<string> {
  const arn = process.env.ANALYZE_STATE_MACHINE_ARN;
  if (!arn) throw new Error("ANALYZE_STATE_MACHINE_ARN is not set");
  const res = await sfn().send(
    new StartExecutionCommand({
      stateMachineArn: arn,
      // Execution name must be unique + idempotent per job (≤80 chars, restricted charset).
      name: `job-${input.jobId}`,
      input: JSON.stringify(input),
    })
  );
  return res.executionArn ?? "";
}
