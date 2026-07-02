"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

// Fire a view-type funnel event once on mount. Drop into any server component:
// <TrackEvent event="plans_view" />. Renders nothing.
export function TrackEvent({ event, data }: { event: string; data?: Record<string, unknown> }) {
  useEffect(() => {
    track(event, data);
    // Fire once per mount — the identity of `data` is intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
  return null;
}
