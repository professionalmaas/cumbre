// Structured single-line JSON logging for the step Lambdas.
// One JSON object per line so CloudWatch Logs Insights can query fields directly.
export function log(level: string, event: string, fields?: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: "cumbre-steps",
      event,
      ...fields,
    })
  );
}
