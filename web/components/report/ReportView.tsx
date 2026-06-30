"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { LegalFooter } from "@/components/LegalFooter";
import { FeedbackControl } from "@/components/report/FeedbackControl";
import { ShareButton } from "@/components/report/ShareButton";
import type { FeedbackRow } from "@/components/report/ReportClient";
import type { FeedbackVote } from "@/lib/queries";
import { type AnalysisReport, type Band, bandLabel, fmtTime } from "@/lib/report";

// ---------- small shared atoms ----------
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: "var(--font-serif)",
        fontWeight: 500,
        fontSize: 21,
        margin: "30px 0 12px",
      }}
    >
      {children}
    </h2>
  );
}
function tickColor(t: number): string {
  // ember -> orange -> gold by position 0..1
  if (t < 0.5) return mix("#e8552d", "#fb7a3c", t / 0.5);
  return mix("#fb7a3c", "#f6c64a", (t - 0.5) / 0.5);
}
function mix(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ---------- summit tick gauge ----------
function SummitGauge({ score, band }: { score: number; band: Band }) {
  const N = 46;
  const cx = 130,
    cy = 124,
    r1 = 78,
    r2 = 104;
  const lit = Math.round((Math.max(0, Math.min(100, score)) / 100) * (N - 1));
  const f = (n: number) => n.toFixed(2); // deterministic server/client SVG coords
  const ticks = Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    const ang = Math.PI - t * Math.PI; // 180°→0°
    const x1 = f(cx + r1 * Math.cos(ang)),
      y1 = f(cy - r1 * Math.sin(ang));
    const x2 = f(cx + r2 * Math.cos(ang)),
      y2 = f(cy - r2 * Math.sin(ang));
    const on = i <= lit;
    return (
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={on ? tickColor(t) : "rgba(246,198,74,0.10)"}
        strokeWidth={3}
        strokeLinecap="round"
      />
    );
  });
  return (
    <div style={{ position: "relative", width: 260, height: 150, margin: "10px auto 0" }}>
      <svg
        viewBox="0 0 260 140"
        width="260"
        height="140"
        role="img"
        aria-label={`Summit score ${Math.round(score)} out of 100, band ${bandLabel(band)}`}
      >
        {ticks}
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: 58, textAlign: "center" }}>
        <div
          className="grad-text"
          style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: 56, lineHeight: 1 }}
        >
          {Math.round(score)}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: 3,
            color: "var(--amber)",
            marginTop: 4,
          }}
        >
          {bandLabel(band)}
        </div>
      </div>
    </div>
  );
}

// ---------- market fit bar ----------
function MarketFit({ m }: { m: AnalysisReport["marketFit"] }) {
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 2, color: "var(--muted)" }}>
          MARKET FIT · {m.genre.toUpperCase()}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--gold)" }}>
          {m.pointsToChartReady} pts to chart-ready
        </span>
      </div>
      <div style={{ position: "relative", height: 12, borderRadius: 999, background: "#1a130b" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${m.you}%`,
            borderRadius: 999,
            background: "linear-gradient(90deg,#e8552d,#fb7a3c,#f6c64a)",
          }}
        />
        {/* genre avg dot */}
        <div
          title="Genre avg"
          style={{
            position: "absolute",
            left: `calc(${m.genreAvg}% - 5px)`,
            top: -2,
            width: 10,
            height: 16,
            borderRadius: 4,
            background: "#cdb893",
            border: "2px solid #0d0a06",
          }}
        />
        {/* chart-ready marker */}
        <div
          title="Chart-ready"
          style={{
            position: "absolute",
            left: `${m.chartReady}%`,
            top: -4,
            bottom: -4,
            width: 2,
            background: "var(--gold)",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 10,
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        <span>
          You <b style={{ color: "var(--ink)" }}>{m.you}</b>
        </span>
        <span>Genre avg {m.genreAvg}</span>
        <span>Chart-ready {m.chartReady}</span>
      </div>
    </div>
  );
}

// ---------- readiness tiles ----------
function ReadinessTiles({ r }: { r: AnalysisReport["readiness"] }) {
  const items: [string, AnalysisReport["readiness"][keyof AnalysisReport["readiness"]]][] = [
    ["Playlist", r.playlist],
    ["Radio", r.radio],
    ["Sync", r.sync],
  ];
  const dot = (s: string) => (s === "ready" ? "#36d399" : s === "close" ? "#f6c64a" : "#c06b54");
  const label = (s: string) => (s === "ready" ? "Ready" : s === "close" ? "Close" : "Not yet");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
      {items.map(([name, s]) => (
        <div key={name} className="card" style={{ padding: "13px 14px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, color: "var(--muted)" }}>
            {name.toUpperCase()}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: dot(s) }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>{label(s)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- energy mountain chart ----------
function EnergyChart({ s }: { s: AnalysisReport["structure"] }) {
  const W = 388,
    H = 120,
    pad = 6;
  const pts = s.sections.map((sec, i) => {
    // round so server and client emit identical SVG coordinate strings (no hydration drift)
    const x = Number((pad + (i / (s.sections.length - 1)) * (W - pad * 2)).toFixed(2));
    const y = Number((H - 14 - sec.energy * (H - 30)).toFixed(2));
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H - 14} L${pts[0][0].toFixed(1)} ${H - 14} Z`;
  const peak = pts[s.peakIndex];
  const lift = pts[s.liftIndex];
  return (
    <div className="card" style={{ padding: "12px 12px 6px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Section energy across the song, peaking at the first chorus">
        <defs>
          <linearGradient id="enfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(251,122,60,0.45)" />
            <stop offset="1" stopColor="rgba(232,85,45,0.04)" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#enfill)" />
        <path d={line} fill="none" stroke="#fb7a3c" strokeWidth={2} />
        {/* lift dashed ring */}
        {lift && <circle cx={lift[0]} cy={lift[1]} r={9} fill="none" stroke="var(--gold)" strokeWidth={1.5} strokeDasharray="3 3" />}
        {/* peak flag */}
        {peak && (
          <>
            <line x1={peak[0]} y1={peak[1]} x2={peak[0]} y2={peak[1] - 18} stroke="var(--gold)" strokeWidth={1.5} />
            <path d={`M${peak[0]} ${peak[1] - 18} l10 4 -10 4 z`} fill="var(--gold)" />
            <circle cx={peak[0]} cy={peak[1]} r={3} fill="var(--gold)" />
          </>
        )}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 4px 4px" }}>
        {s.sections.map((sec, i) => (
          <span
            key={i}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: 0.5,
              color: i === s.peakIndex ? "var(--gold)" : "var(--faint)",
            }}
          >
            {sec.label.replace(/[0-9]/g, "").slice(0, 3).toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------- highlight player ----------
function Highlight({ h, duration, audioUrl }: { h: AnalysisReport["highlight"]; duration: number; audioUrl?: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const bars = useMemo(
    () =>
      Array.from({ length: 56 }, (_, i) => {
        // deterministic pseudo-waveform — emit the height as a fixed-precision percentage
        // STRING so server and client render byte-identical markup (no float-precision drift
        // that would otherwise trigger a hydration mismatch).
        const v = 0.35 + 0.55 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6));
        const heightPct = `${(v * 100).toFixed(2)}%`;
        const t = (i / 56) * duration;
        const lit = t >= h.startSec && t <= h.endSec;
        return { heightPct, lit };
      }),
    [duration, h.startSec, h.endSec]
  );

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    a.currentTime = h.startSec;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      if (a.currentTime >= h.endSec) {
        a.pause();
        a.currentTime = h.startSec;
        setPlaying(false);
      }
    };
    a.addEventListener("timeupdate", onTime);
    return () => a.removeEventListener("timeupdate", onTime);
  }, [h.startSec, h.endSec]);

  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 2, color: "var(--muted)" }}>
          YOUR HIGHLIGHT · {h.label.toUpperCase()}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--gold)" }}>
          {fmtTime(h.startSec)}–{fmtTime(h.endSec)} · {Math.round(h.endSec - h.startSec)}s
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 48, margin: "14px 0 4px" }}>
        {bars.map((b, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: b.heightPct,
              borderRadius: 2,
              background: b.lit ? "var(--gold)" : "rgba(246,198,74,0.18)",
            }}
          />
        ))}
      </div>
      <button
        className="btn-ghost"
        onClick={toggle}
        disabled={!audioUrl}
        style={{ marginTop: 8 }}
        title={audioUrl ? "" : "Highlight playback is available right after analysis (your audio isn't stored)."}
      >
        {audioUrl ? (playing ? "■ Pause highlight" : "▶ Play highlight") : "Highlight playback unavailable (audio not stored)"}
      </button>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="none" />}
    </div>
  );
}

// ---------- subscore bars ----------
function Bars({ items }: { items: { label: string; value: number }[] }) {
  const c = (v: number) =>
    v >= 80 ? "linear-gradient(90deg,#36d399,#5be0a8)" : v >= 60 ? "linear-gradient(90deg,#fb7a3c,#f6c64a)" : "linear-gradient(90deg,#e8552d,#fb7a3c)";
  return (
    <div className="card" style={{ padding: "6px 16px" }}>
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            display: "grid",
            gridTemplateColumns: "112px 1fr 34px",
            gap: 10,
            alignItems: "center",
            padding: "10px 0",
            borderBottom: "1px solid rgba(246,198,74,0.07)",
          }}
        >
          <span style={{ fontSize: 13, color: "#d9cdb6" }}>{it.label}</span>
          <span style={{ height: 7, borderRadius: 99, background: "#1a130b", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${it.value}%`, background: c(it.value) }} />
          </span>
          <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700 }}>
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- the report ----------
export function ReportView({
  report,
  filename,
  audioUrl,
  jobId,
  feedback = [],
  shareToken = null,
}: {
  report: AnalysisReport;
  filename?: string | null;
  audioUrl?: string | null;
  jobId?: string;
  feedback?: FeedbackRow[];
  shareToken?: string | null;
}) {
  const r = report;
  // Look up the user's existing vote for a given slot so controls render pre-selected.
  const voteFor = (target: "fix" | "report", rank: number | null): FeedbackVote | null =>
    feedback.find((f) => f.target === target && (f.rank ?? null) === rank)?.vote ?? null;
  const chip = (t: string) => (
    <span
      key={t}
      style={{
        fontSize: 12,
        color: "var(--ink)",
        background: "var(--warm)",
        border: "1px solid var(--line)",
        borderRadius: 999,
        padding: "5px 11px",
      }}
    >
      {t}
    </span>
  );

  return (
    <main className="frame">
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" className="btn-ghost" aria-label="Back to home" style={{ width: 36, height: 36, padding: 0, borderRadius: 999 }}>
            ‹
          </Link>
          <Brand />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 2, color: "var(--gold)" }}>
          UNLOCKED
        </span>
      </header>

      <div className="eyebrow" style={{ marginTop: 22 }}>
        Your route report
      </div>
      <h1 className="serif" style={{ fontSize: 32, margin: "8px 0 10px" }}>
        {r.song.title || filename || "Your song"}
      </h1>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
        {chip(r.song.genre)}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
          {r.song.key} · {Math.round(r.song.tempoBpm)} BPM · {fmtTime(r.song.durationSec)}
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--faint)", marginBottom: 16 }}>
        Reviewed as · {r.review.lens} lens · {r.review.depth} climb
      </div>

      {/* hero gauge */}
      <div
        className="card"
        style={{ padding: "20px 18px 24px", background: "linear-gradient(180deg,var(--warm),rgba(255,255,255,0.02))" }}
      >
        <SummitGauge score={Math.max(17, r.scores.overall)} band={r.scores.band} />
        <p
          className="serif"
          style={{ textAlign: "center", fontStyle: "italic", color: "var(--muted)", margin: "10px 6px 0", fontSize: 15 }}
        >
          {r.scores.verdict}
        </p>
      </div>

      <SectionTitle>Where you land</SectionTitle>
      <MarketFit m={r.marketFit} />
      <div style={{ height: 10 }} />
      <ReadinessTiles r={r.readiness} />

      <SectionTitle>How the song climbs</SectionTitle>
      <EnergyChart s={r.structure} />

      <SectionTitle>Your highlight</SectionTitle>
      <Highlight h={r.highlight} duration={r.song.durationSec} audioUrl={audioUrl} />

      {/* two scores */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 18 }}>
        {(
          [
            ["Music", Math.max(17, r.scores.music)],
            ["Lyrics", Math.max(17, r.scores.lyrics)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="card" style={{ padding: "16px 18px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1.5, color: "var(--muted)" }}>
              {k.toUpperCase()}
            </div>
            <div className="serif" style={{ fontSize: 32, marginTop: 2 }}>
              {Math.round(v)}
              <span style={{ fontSize: 15, color: "var(--muted)" }}>/100</span>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>What&apos;s working — keep these</SectionTitle>
      <div style={{ display: "grid", gap: 10 }}>
        {r.keep.map((k, i) => (
          <div key={i} className="card" style={{ padding: "14px 16px", borderLeft: "3px solid #36d399" }}>
            <b style={{ display: "block", marginBottom: 3 }}>{k.title}</b>
            <span style={{ color: "var(--muted)", fontSize: 14 }}>{k.note}</span>
          </div>
        ))}
      </div>

      <SectionTitle>Top 3 fixes to reach the summit</SectionTitle>
      <div style={{ display: "grid", gap: 12 }}>
        {r.fixes.slice(0, 3).map((f) => (
          <div
            key={f.rank}
            className="card"
            style={{
              padding: "16px 18px",
              borderLeft: "3px solid var(--orange)",
              display: "grid",
              gridTemplateColumns: "30px 1fr",
              gap: 13,
            }}
          >
            <div
              className="serif grad-text"
              style={{ fontSize: 26, fontWeight: 600, lineHeight: 1 }}
            >
              {f.rank}
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <b>{f.title}</b>
                <span
                  style={{
                    flexShrink: 0,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "#1a1205",
                    background: "var(--grad)",
                    borderRadius: 999,
                    padding: "3px 9px",
                    fontWeight: 700,
                  }}
                >
                  +{f.impact.points} {f.impact.area}
                </span>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>{f.note}</div>
              {jobId && (
                <FeedbackControl
                  jobId={jobId}
                  target="fix"
                  rank={f.rank}
                  initialVote={voteFor("fix", f.rank)}
                  compact
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>The full pitch</SectionTitle>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1.5, color: "var(--muted)", margin: "0 0 6px" }}>
        MUSIC
      </div>
      <Bars items={r.subscores.music} />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1.5, color: "var(--muted)", margin: "14px 0 6px" }}>
        LYRICS
      </div>
      <Bars items={r.subscores.lyrics} />

      <SectionTitle>Mix &amp; master</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {(
          [
            ["Integrated loudness", `${r.mix.lufs} LUFS`, `Hot vs ${r.mix.lufsTarget} target`],
            ["Dynamic range", `DR ${r.mix.dynamicRange}`, r.mix.dynamicRange < 7 ? "A touch squashed" : "Healthy"],
            ["True peak", `${r.mix.truePeakDb} dBTP`, "Safe headroom"],
            ["Stereo width", `${r.mix.stereoWidthPct}%`, "Wide, balanced"],
          ] as const
        ).map(([k, v, note]) => (
          <div key={k} className="card" style={{ padding: "14px 15px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.2, color: "var(--muted)" }}>
              {k.toUpperCase()}
            </div>
            <div className="serif" style={{ fontSize: 22, marginTop: 4 }}>
              {v}
            </div>
            <div style={{ fontSize: 12, color: "var(--gold)", marginTop: 3 }}>{note}</div>
          </div>
        ))}
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 10 }}>{r.mix.note}</p>

      <SectionTitle>Climbs alongside</SectionTitle>
      <div className="card" style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{r.comparables.artists.map(chip)}</div>
        <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>
          Best-fit playlists: {r.comparables.playlists.join(" · ")}
        </div>
        <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>Core audience: {r.comparables.audience}</div>
      </div>

      <SectionTitle>Extracted features</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {(
          [
            ["Key", r.features.key],
            ["Tempo", `${Math.round(r.features.tempoBpm)} BPM`],
            ["Energy", r.features.energy.toFixed(2)],
            ["Danceability", r.features.danceability.toFixed(2)],
            ["Loudness", `${r.features.loudnessDb} LUFS`],
            ["Valence", r.features.valence.toFixed(2)],
            ["Time sig", r.features.timeSignature],
            ["Duration", fmtTime(r.features.durationSec)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="card" style={{ padding: "12px 14px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, color: "var(--muted)" }}>
              {k.toUpperCase()}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 3 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* overall-report rating — the report-level half of the active-learning loop */}
      {jobId && (
        <div className="card" style={{ padding: "16px 18px", marginTop: 28 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1.5, color: "var(--muted)" }}>
            HOW WAS THIS REPORT?
          </div>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "4px 0 0" }}>
            Your rating trains your guide to give sharper notes next climb.
          </p>
          <FeedbackControl jobId={jobId} target="report" initialVote={voteFor("report", null)} />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
        <Link href="/profile" className="btn-primary">
          Save my results →
        </Link>
        {shareToken && <ShareButton token={shareToken} score={Math.round(r.scores.overall)} />}
        <Link href="/upload" className="btn-ghost">
          Re-climb with these fixes
        </Link>
      </div>

      <p style={{ textAlign: "center", color: "var(--faint)", fontSize: 11, marginTop: 22, lineHeight: 1.6 }}>
        Cumbre gives AI craft feedback to help you improve your song. It is informational, not professional A&amp;R
        advice, and not a prediction of commercial success. Your audio is analyzed and then deleted — we never store or
        display your lyrics.
      </p>
      <LegalFooter />
    </main>
  );
}
