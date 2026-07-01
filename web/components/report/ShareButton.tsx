"use client";

import { useState } from "react";

// "Share my summit" — shares the OG score card image via the native OS share sheet, which
// surfaces Instagram/WhatsApp/Facebook as targets on mobile (the user completes the actual
// Stories/Status post inside that app — there's no reliable web deep-link straight into
// Stories/Status on either platform). Falls back to copying the image, then the link, for
// desktop or browsers without file-share support.
export function ShareButton({ token, score }: { token: string; score: number }) {
  const [status, setStatus] = useState<"idle" | "copied-link" | "copied-image">("idle");

  function shareUrl(): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/share/${token}`;
  }

  function imageUrl(): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/share/${token}/opengraph-image`;
  }

  async function fetchImageFile(): Promise<File> {
    const res = await fetch(imageUrl());
    const blob = await res.blob();
    return new File([blob], "cumbre-summit.png", { type: "image/png" });
  }

  async function onShare() {
    const url = shareUrl();
    const text = `I scored ${score} on Cumbre — grade your own song. ${url}`;

    // Primary: native OS share sheet with the image file (Instagram/WhatsApp/Facebook show up
    // here on mobile). Requires a real user gesture, which this click handler provides.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        const file = await fetchImageFile();
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "My Cumbre summit", text });
          return;
        }
        await navigator.share({ title: "My Cumbre summit", text: `I scored ${score} on Cumbre — grade your own song.`, url });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return; // user cancelled — no fallback noise
        // fetch/share failed (e.g. desktop without file-share support) — fall through
      }
    }

    // Fallback 1: copy the image to the clipboard so it can be pasted into IG/FB/WhatsApp directly.
    try {
      const file = await fetchImageFile();
      await navigator.clipboard.write([new ClipboardItem({ [file.type]: file })]);
      setStatus("copied-image");
      setTimeout(() => setStatus("idle"), 2200);
      return;
    } catch {
      // clipboard image write unsupported — fall through to link copy
    }

    // Fallback 2: copy the link.
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied-link");
      setTimeout(() => setStatus("idle"), 2200);
    } catch {
      // last resort: nothing visible to do
    }
  }

  const label =
    status === "copied-image" ? "Image copied ✓" : status === "copied-link" ? "Link copied ✓" : "Share my summit ↗";

  return (
    <button
      type="button"
      onClick={onShare}
      className="btn-ghost"
      aria-label="Share my summit score"
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
    >
      {label}
    </button>
  );
}
