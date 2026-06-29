"use client";

// Branded route-level error boundary. Catches render/data errors in any segment that
// doesn't define its own error.tsx. Reuses the design tokens + .frame/.btn-* utilities.
import { useEffect } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface to server logs / observability without leaking details to the user.
    console.error("route error", error);
  }, [error]);

  return (
    <main className="frame">
      <header>
        <Brand />
      </header>
      <div style={{ marginTop: 70, textAlign: "center" }}>
        <div className="eyebrow">The route washed out</div>
        <h1 className="serif" style={{ fontSize: 28, margin: "10px 0 8px" }}>
          We hit a patch of loose rock
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 14.5, maxWidth: 340, margin: "0 auto" }}>
          Something went wrong on our end. Your work and any credits are safe — give it another go,
          or head back to base camp.
        </p>
        {error.digest && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--faint)", marginTop: 14 }}>
            ref {error.digest}
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 280, margin: "26px auto 0" }}>
          <button className="btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/" className="btn-ghost">
            Back to base camp
          </Link>
        </div>
      </div>
    </main>
  );
}
