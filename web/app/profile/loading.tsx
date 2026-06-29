// Branded loading state for the summit log while jobs + entitlement load.
import { Brand } from "@/components/Brand";

export default function Loading() {
  return (
    <main className="frame" aria-busy="true">
      <header>
        <Brand />
      </header>
      <div className="eyebrow" style={{ marginTop: 24 }}>
        Summit log
      </div>
      <div className="serif" style={{ fontSize: 30, margin: "8px 0 16px", color: "var(--faint)" }} role="status" aria-live="polite">
        Loading your climbs…
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card" style={{ height: 54, opacity: 0.4 }} />
        ))}
      </div>
    </main>
  );
}
