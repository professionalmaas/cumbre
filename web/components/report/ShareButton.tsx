"use client";

import { useState } from "react";

// "Share my summit" — copies a public /share/[token] link (and uses the native share sheet
// when available). The public page leaks ONLY score/band/title/verdict — no methodology.
export function ShareButton({ token, score }: { token: string; score: number }) {
  const [copied, setCopied] = useState(false);

  function shareUrl(): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/share/${token}`;
  }

  async function onShare() {
    const url = shareUrl();
    const text = `I scored ${score} on Cumbre — grade your own song.`;
    // Prefer the native share sheet on mobile; fall back to clipboard copy.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "My Cumbre summit", text, url });
        return;
      } catch {
        // user cancelled or unsupported — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // last resort: select-and-prompt isn't worth the weight; do nothing visible
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className="btn-ghost"
      aria-label="Share my summit score"
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
    >
      {copied ? "Link copied ✓" : "Share my summit ↗"}
    </button>
  );
}
