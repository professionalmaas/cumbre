"use client";

import { useState } from "react";
import { submitFeedback } from "@/lib/actions/feedback";
import type { FeedbackVote } from "@/lib/queries";

// Compact thumbs up/down with an optional one-line note. Used on each Top-3 fix and on the
// overall report. Optimistic: the chosen vote highlights immediately; the note reveals on
// a down-vote (where the "why" is most useful for active learning).
export function FeedbackControl({
  jobId,
  target,
  rank = null,
  initialVote = null,
  compact = false,
}: {
  jobId: string;
  target: "fix" | "report";
  rank?: number | null;
  initialVote?: FeedbackVote | null;
  compact?: boolean;
}) {
  const [vote, setVote] = useState<FeedbackVote | null>(initialVote);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function cast(v: FeedbackVote) {
    if (busy) return;
    setBusy(true);
    setVote(v);
    setSaved(false);
    setShowNote(v === "down");
    const res = await submitFeedback({ jobId, target, rank, vote: v, note: note || undefined });
    setBusy(false);
    if (res.ok) setSaved(v === "up"); // for down we wait for the note to confirm
  }

  async function saveNote() {
    if (!vote || busy) return;
    setBusy(true);
    const res = await submitFeedback({ jobId, target, rank, vote, note: note || undefined });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      setShowNote(false);
    }
  }

  const btn = (v: FeedbackVote, label: string, glyph: string) => {
    const on = vote === v;
    return (
      <button
        type="button"
        onClick={() => cast(v)}
        disabled={busy}
        aria-label={label}
        aria-pressed={on}
        title={label}
        style={{
          display: "inline-grid",
          placeItems: "center",
          width: 30,
          height: 30,
          borderRadius: 999,
          cursor: busy ? "default" : "pointer",
          fontSize: 14,
          color: on ? "#1a1205" : "var(--muted)",
          background: on ? "var(--grad)" : "transparent",
          border: on ? "1px solid transparent" : "1px solid var(--line-strong)",
        }}
      >
        {glyph}
      </button>
    );
  };

  return (
    <div style={{ marginTop: compact ? 8 : 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {!compact && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.2, color: "var(--faint)" }}>
            HELPFUL?
          </span>
        )}
        {btn("up", "This was helpful", "▲")}
        {btn("down", "This missed the mark", "▼")}
        {saved && (
          <span aria-live="polite" style={{ fontSize: 11, color: "var(--gold)", marginLeft: 2 }}>
            Thanks — noted.
          </span>
        )}
      </div>
      {showNote && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            placeholder="What did we miss? (optional)"
            aria-label="Optional note about this feedback"
            style={{
              flex: 1,
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: "8px 11px",
              color: "var(--ink)",
              fontSize: 13,
              fontFamily: "var(--font-sans)",
            }}
          />
          <button
            type="button"
            onClick={saveNote}
            disabled={busy}
            className="btn-ghost"
            style={{ width: "auto", padding: "8px 14px" }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
