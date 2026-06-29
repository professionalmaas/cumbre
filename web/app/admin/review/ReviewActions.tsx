"use client";

import { useTransition } from "react";
import { rejectReview, refundReview, dismissReview } from "./actions";

export function ReviewActions({ reviewId }: { reviewId: string }) {
  const [pending, start] = useTransition();

  const btn: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 13,
    border: "1px solid var(--line)",
    cursor: pending ? "default" : "pointer",
    opacity: pending ? 0.6 : 1,
    background: "transparent",
    color: "var(--ink)",
  };

  return (
    <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
      <button
        style={{ ...btn, borderColor: "#5b3a3a", color: "var(--bad)" }}
        disabled={pending}
        onClick={() => start(() => void rejectReview(reviewId))}
      >
        Reject
      </button>
      <button
        style={{ ...btn, borderColor: "#3a5b48", color: "var(--good)" }}
        disabled={pending}
        onClick={() => start(() => void refundReview(reviewId))}
      >
        Refund credit
      </button>
      <button
        style={btn}
        disabled={pending}
        onClick={() => start(() => void dismissReview(reviewId))}
      >
        Dismiss
      </button>
    </div>
  );
}
