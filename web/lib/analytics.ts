"use client";

// Funnel analytics via the CloudWatch RUM SDK that's already injected by RumSnippet
// (custom events are ENABLED on the app monitor in infra/terraform/rum.tf) — no new
// provider, no extra script. Events land in the RUM console under Custom events.
//
// Canonical funnel: sample_play -> sample_report_view -> plans_view -> login_start ->
// checkout_start -> report_delivered.

type Cwr = (command: "recordEvent", payload: { type: string; data?: Record<string, unknown> }) => void;

declare global {
  interface Window {
    cwr?: Cwr;
  }
}

export function track(event: string, data?: Record<string, unknown>): void {
  try {
    window.cwr?.("recordEvent", { type: event, data });
  } catch {
    // Analytics must never break the app — swallow (SDK absent in dev, ad-blocked, etc.).
  }
}
