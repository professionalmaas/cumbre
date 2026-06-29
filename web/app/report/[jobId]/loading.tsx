// Lightweight branded loading state while the report server component fetches.
import { Brand } from "@/components/Brand";

export default function Loading() {
  return (
    <main className="frame" aria-busy="true">
      <header>
        <Brand />
      </header>
      <div style={{ marginTop: 80, textAlign: "center" }}>
        <div className="eyebrow">Loading your route report</div>
        <div
          className="grad-text serif"
          style={{ fontSize: 32, fontWeight: 600, marginTop: 12 }}
          role="status"
          aria-live="polite"
        >
          Reading the route…
        </div>
        <div
          style={{
            height: 7,
            borderRadius: 99,
            background: "#1a130b",
            overflow: "hidden",
            margin: "18px auto 0",
            maxWidth: 240,
          }}
        >
          <div style={{ height: "100%", width: "45%", background: "var(--grad)" }} />
        </div>
      </div>
    </main>
  );
}
