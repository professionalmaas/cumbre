"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { prepareUpload, enqueueAnalysis } from "@/lib/actions/upload";
import { setAudio } from "@/lib/audioStore";
import type { Depth, Lens } from "@/lib/report";

const GENRES = ["Pop", "Indie Pop", "R&B / Soul", "Hip-Hop", "Electronic", "Folk", "Rock", "Country"];
const CURRENT_YEAR = new Date().getFullYear();
const MAX_BYTES = 50 * 1_048_576; // 50 MB — matches the dropzone copy + server-side limits

// Upload the presigned PUT with a small retry/backoff for transient network or 5xx errors.
// 4xx (e.g. expired/forbidden URL) is not retried — it won't get better on its own.
async function putWithRetry(url: string, file: File, contentType: string, tries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { method: "PUT", headers: { "content-type": contentType }, body: file });
      if (res.ok) return res;
      // Retry only transient server-side failures; surface client errors immediately.
      if (res.status < 500 || attempt === tries) return res;
    } catch (e) {
      // Network/abort error — retryable until we run out of attempts.
      lastErr = e;
      if (attempt === tries) throw e;
    }
    await new Promise((r) => setTimeout(r, 400 * attempt)); // 400ms, 800ms backoff
  }
  throw lastErr ?? new Error("Upload failed");
}

// Map server-action error codes to human copy. Most errors from upload.ts are already full
// sentences (passed through); "rate_limited" is the one machine code that needs friendly text.
// NOTE: under the teaser model, grading is free — the daily cap is abuse protection on the
// free-to-run pipeline, NOT a paywall, so this does not push the user to /plans.
function uploadErrorMessage(code: string): string {
  if (code === "rate_limited") {
    return "You've hit today's free grading limit. Come back tomorrow, or reach out if you need more.";
  }
  return code;
}

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "9px 14px",
        borderRadius: 999,
        fontSize: 13.5,
        fontWeight: 600,
        cursor: "pointer",
        border: on ? "1px solid transparent" : "1px solid var(--line-strong)",
        color: on ? "#1a1205" : "var(--ink)",
        background: on ? "var(--grad)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

function Seg({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string; note: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${options.length},1fr)`, gap: 8 }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            type="button"
            key={o.id}
            onClick={() => onChange(o.id)}
            className="card"
            style={{
              padding: "12px 10px",
              cursor: "pointer",
              textAlign: "center",
              color: on ? "#1a1205" : "var(--ink)",
              background: on ? "var(--grad)" : "var(--card)",
              border: on ? "1px solid transparent" : "1px solid var(--line)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{o.label}</div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                marginTop: 2,
                color: on ? "#3a2a10" : "var(--muted)",
              }}
            >
              {o.note}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [genre, setGenre] = useState("Pop");
  const [depth, setDepth] = useState<Depth>("deep");
  const [lens, setLens] = useState<Lens>("ar");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!file) return setError("Choose an audio file.");
    if (file.size > MAX_BYTES) return setError("That track is over 50 MB. Bounce a smaller file (MP3/WAV) and try again.");
    if (!rights) return setError("Confirm you own the rights to this song.");

    setBusy(true);
    try {
      setStatus("Preparing…");
      const prep = await prepareUpload(file.name);
      if (!prep.ok) {
        setBusy(false);
        return setError(uploadErrorMessage(prep.error));
      }

      setStatus("Uploading…");
      let put: Response;
      try {
        put = await putWithRetry(prep.data.uploadUrl, file, prep.data.contentType);
      } catch {
        setBusy(false);
        return setError("Upload didn't go through — check your connection and tap Begin ascent to retry.");
      }
      if (!put.ok) {
        setBusy(false);
        return setError(
          put.status === 403
            ? "Your upload link expired. Tap Begin ascent to get a fresh one."
            : `Upload failed (${put.status}). Tap Begin ascent to try again.`
        );
      }

      setStatus("Starting ascent…");
      const res = await enqueueAnalysis({
        songId: prep.data.songId,
        storageKey: prep.data.storageKey,
        originalFilename: file.name,
        genre,
        depth,
        lens,
        year,
        rightsWarranty: rights,
      });
      if (!res.ok) {
        setBusy(false);
        return setError(uploadErrorMessage(res.error));
      }

      // Keep the audio in-session so the report can play the highlight (never stored server-side).
      setAudio(res.jobId, file);
      router.push(`/report/${res.jobId}`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {/* dropzone */}
      <label
        className="card"
        style={{
          display: "block",
          border: "1px dashed rgba(246,198,74,0.32)",
          borderRadius: 16,
          padding: file ? "16px 18px" : "30px 18px",
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <input
          type="file"
          accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ display: "none" }}
        />
        {file ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--grad)",
                display: "grid",
                placeItems: "center",
                color: "#1a1205",
              }}
            >
              ♪
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file.name}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                {(file.size / 1_048_576).toFixed(1)} MB · tap to change
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ color: "var(--gold)", fontSize: 24 }}>↑</div>
            <div style={{ fontWeight: 600, marginTop: 6 }}>Drop your track</div>
            <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 2 }}>
              MP3 or WAV · upload only · max 50 MB
            </div>
          </>
        )}
      </label>

      <h2 className="serif" style={{ fontSize: 21, margin: "26px 0 4px" }}>
        What are we climbing?
      </h2>
      <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "0 0 12px" }}>
        Pick a route — it tunes how your guide scores the song.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {GENRES.map((g) => (
          <Chip key={g} on={genre === g} onClick={() => setGenre(g)}>
            {g}
          </Chip>
        ))}
      </div>

      <h2 className="serif" style={{ fontSize: 21, margin: "26px 0 4px" }}>
        Tune your climb
      </h2>
      <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "0 0 12px" }}>
        How deep to go, and whose ears to use.
      </p>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, color: "var(--muted)", margin: "0 0 6px" }}>
        DEPTH
      </div>
      <Seg
        value={depth}
        onChange={(v) => setDepth(v as Depth)}
        options={[
          { id: "fast", label: "Quick read", note: "~30 sec" },
          { id: "deep", label: "Deep climb", note: "fuller notes" },
        ]}
      />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, color: "var(--muted)", margin: "14px 0 6px" }}>
        FEEDBACK LENS
      </div>
      <Seg
        value={lens}
        onChange={(v) => setLens(v as Lens)}
        options={[
          { id: "listener", label: "Listener", note: "fan ears" },
          { id: "producer", label: "Producer", note: "the mix" },
          { id: "ar", label: "A&R", note: "the market" },
        ]}
      />

      <label
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          fontSize: 13,
          color: "var(--muted)",
          cursor: "pointer",
          marginTop: 20,
        }}
      >
        <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          I own or control the rights to this recording and may upload it for analysis. We analyze your track, then
          delete it — your audio file is never stored.
        </span>
      </label>

      {error && (
        <p role="alert" aria-live="assertive" style={{ color: "#f87272", fontSize: 13, marginTop: 12 }}>
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary" disabled={busy} style={{ marginTop: 18 }}>
        {busy ? status || "Working…" : "Begin ascent →"}
      </button>
    </form>
  );
}
