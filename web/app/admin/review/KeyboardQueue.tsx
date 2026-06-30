"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReviewRowEnhanced } from "@/lib/types";
import { approveReview, rejectReview, refundReview, dismissReview } from "./actions";

// Category labels + colors
const CATEGORY_META: Record<string, { label: string; color: string }> = {
  copyright:      { label: "Copyright",      color: "var(--warn)" },
  moderation:     { label: "Moderation",     color: "#f97316" },
  low_confidence: { label: "Low confidence", color: "var(--gold)" },
  ood:            { label: "Out of domain",  color: "#a78bfa" },
  payment:        { label: "Payment",        color: "var(--bad)" },
  drift:          { label: "Model drift",    color: "var(--muted)" },
};

interface ReviewCardProps {
  row: ReviewRowEnhanced;
  isActive: boolean;
  onClick: () => void;
}

function ReviewCard({ row, isActive, onClick }: ReviewCardProps) {
  const [pending, startPending] = useState(false);
  const [done, setDone] = useState(false);
  const meta = CATEGORY_META[row.category] ?? { label: row.category, color: "var(--muted)" };
  const ageHours = Math.round((Date.now() - new Date(row.created_at).getTime()) / 3_600_000);
  const isP0 = ageHours >= 4 || row.priority === 0;

  const act = useCallback(
    (fn: (id: string) => Promise<void>) => {
      if (pending || done) return;
      startPending(true);
      fn(row.id)
        .then(() => setDone(true))
        .catch(() => startPending(false));
    },
    [row.id, pending, done]
  );

  if (done) return null;

  const btn: React.CSSProperties = {
    padding: "7px 13px",
    borderRadius: 9,
    fontWeight: 700,
    fontSize: 12,
    border: "1px solid var(--line)",
    cursor: pending ? "default" : "pointer",
    opacity: pending ? 0.5 : 1,
    background: "transparent",
    color: "var(--ink)",
    transition: "opacity 0.15s",
  };

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--card)",
        border: `1px solid ${isActive ? "var(--gold)" : "var(--line)"}`,
        borderRadius: 14,
        padding: "16px 18px",
        cursor: "pointer",
        transition: "border-color 0.15s",
        position: "relative",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              color: meta.color,
              padding: "2px 8px",
              border: `1px solid ${meta.color}`,
              borderRadius: 99,
            }}
          >
            {meta.label}
          </span>
          {isP0 && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: "var(--bad)", textTransform: "uppercase" }}>
              SLA BREACH
            </span>
          )}
        </div>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>
          {ageHours}h ago
        </span>
      </div>

      {/* Song + job info */}
      <div style={{ margin: "10px 0 6px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
          job {row.job_id.slice(0, 8)}
        </span>
        {row.original_filename && (
          <span style={{ fontSize: 12.5, color: "var(--faint)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.original_filename}
          </span>
        )}
        {row.genre && (
          <span style={{ fontSize: 11, color: "var(--muted)", padding: "1px 7px", border: "1px solid var(--line)", borderRadius: 99 }}>
            {row.genre}
          </span>
        )}
        {row.confidence != null && (
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            conf: {(row.confidence * 100).toFixed(0)}%
          </span>
        )}
        <span
          style={{
            fontSize: 11,
            color: row.job_status === "done" ? "#22c55e" : row.job_status === "rejected" ? "var(--bad)" : "var(--muted)",
          }}
        >
          {row.job_status.replace(/_/g, " ")}
        </span>
      </div>

      {/* Flagged reason or payload preview */}
      {(row.flagged_reason != null || row.payload != null) && (
        <pre
          style={{
            background: "var(--bg2)",
            border: "1px solid var(--line)",
            borderRadius: 9,
            padding: "9px 11px",
            fontSize: 11,
            color: "#cdd9f5",
            overflowX: "auto",
            margin: "8px 0",
            maxHeight: 96,
            overflowY: "auto",
          }}
        >
          {row.flagged_reason ?? JSON.stringify(row.payload, null, 2)}
        </pre>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button
          style={{ ...btn, borderColor: "#3a5b48", color: "var(--good)" }}
          disabled={pending}
          onClick={(e) => { e.stopPropagation(); act(approveReview); }}
          title="Mark cleared — set job to done if results exist"
        >
          ✓ Approve
        </button>
        <button
          style={{ ...btn, borderColor: "#5b3a3a", color: "var(--bad)" }}
          disabled={pending}
          onClick={(e) => { e.stopPropagation(); act(rejectReview); }}
        >
          ✗ Reject
        </button>
        <button
          style={{ ...btn, borderColor: "#3a4a5b", color: "#60a5fa" }}
          disabled={pending}
          onClick={(e) => { e.stopPropagation(); act(refundReview); }}
        >
          ↩ Refund
        </button>
        <button
          style={btn}
          disabled={pending}
          onClick={(e) => { e.stopPropagation(); act(dismissReview); }}
        >
          — Dismiss
        </button>
      </div>
    </div>
  );
}

interface Props {
  rows: ReviewRowEnhanced[];
}

export function KeyboardQueue({ rows }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't steal keypresses inside inputs/buttons
      if ((e.target as HTMLElement).tagName === "BUTTON" || (e.target as HTMLElement).tagName === "INPUT") return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, rows.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "?") {
        setShowHelp((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rows.length]);

  if (!rows.length) {
    return <p style={{ color: "var(--muted)", marginTop: 24 }}>Queue is clear. 🎉</p>;
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "12px 0" }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={() => setShowHelp((v) => !v)}
          style={{ background: "none", border: "1px solid var(--line)", borderRadius: 7, padding: "3px 9px", fontSize: 11, color: "var(--muted)", cursor: "pointer" }}
        >
          ? shortcuts
        </button>
      </div>

      {showHelp && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 18px", marginBottom: 14, fontSize: 12, color: "var(--muted)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: "6px 12px" }}>
            <code style={{ fontFamily: "var(--font-mono)" }}>J / ↓</code><span>Next item</span>
            <code style={{ fontFamily: "var(--font-mono)" }}>K / ↑</code><span>Previous item</span>
            <code style={{ fontFamily: "var(--font-mono)" }}>?</code><span>Toggle this help</span>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((row, i) => (
          <ReviewCard
            key={row.id}
            row={row}
            isActive={i === activeIdx}
            onClick={() => setActiveIdx(i)}
          />
        ))}
      </div>
    </>
  );
}
