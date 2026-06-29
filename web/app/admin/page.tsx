import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { getAdminStats, listOpenReviews } from "@/lib/queries";
import { Brand } from "@/components/Brand";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  queued: "var(--muted)",
  running: "var(--orange)",
  needs_review: "var(--gold)",
  done: "#36d399",
  failed: "#f87272",
  rejected: "#f87272",
};

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, color: "var(--muted)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div className="serif" style={{ fontSize: 30, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/");

  const [stats, openReviews] = await Promise.all([getAdminStats(), listOpenReviews()]);
  const { funnel, feedback, jobsByStatus, recent } = stats;

  // funnel conversion rates (guard divide-by-zero)
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const fbTotal = feedback.up + feedback.down;
  const fixSatisfaction = fbTotal > 0 ? Math.round((feedback.up / fbTotal) * 100) : null;

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px 80px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <Brand />
        <span style={{ color: "var(--muted)", fontSize: 13 }}>Dashboard · {admin.email}</span>
      </header>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Operations dashboard</h1>
        <Link
          href="/admin/review"
          className="btn-ghost"
          style={{ width: "auto", padding: "9px 16px" }}
        >
          Review queue{openReviews.length ? ` · ${openReviews.length} open` : ""} →
        </Link>
      </div>

      {/* Funnel */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", margin: "26px 0 10px", letterSpacing: 0.4 }}>
        FUNNEL
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <Stat label="Signups" value={funnel.signups} />
        <Stat label="Paid" value={funnel.paid} sub={`${pct(funnel.paid, funnel.signups)}% of signups`} />
        <Stat label="Reports delivered" value={funnel.delivered} sub={`${pct(funnel.delivered, funnel.paid)}% of paid`} />
      </div>

      {/* Jobs by status */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", margin: "26px 0 10px", letterSpacing: 0.4 }}>
        JOBS BY STATUS
      </h2>
      {jobsByStatus.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>No jobs yet.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
          {jobsByStatus.map((j) => (
            <div key={j.status} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_COLOR[j.status] ?? "var(--muted)" }} />
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{j.status.replace(/_/g, " ")}</span>
              </div>
              <div className="serif" style={{ fontSize: 24, marginTop: 4 }}>{j.count}</div>
            </div>
          ))}
        </div>
      )}

      {/* Feedback summary */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", margin: "26px 0 10px", letterSpacing: 0.4 }}>
        FEEDBACK (ACTIVE LEARNING SIGNAL)
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <Stat label="Fix · helpful" value={feedback.up} />
        <Stat label="Fix · missed" value={feedback.down} />
        <Stat
          label="Fix satisfaction"
          value={fixSatisfaction === null ? "—" : `${fixSatisfaction}%`}
          sub={fbTotal > 0 ? `${fbTotal} votes` : "no votes yet"}
        />
        <Stat label="Report ▲ / ▼" value={`${feedback.reportUp} / ${feedback.reportDown}`} />
      </div>

      {/* Recent activity */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", margin: "26px 0 10px", letterSpacing: 0.4 }}>
        RECENT ACTIVITY
      </h2>
      {recent.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Nothing yet.</p>
      ) : (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "2px 16px" }}>
          {recent.map((j) => (
            <div
              key={j.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "11px 0",
                borderBottom: "1px solid var(--line-soft)",
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
                  {j.id.slice(0, 8)}
                </span>
                {j.genre && <span style={{ fontSize: 12.5, color: "var(--faint)", marginLeft: 10 }}>{j.genre}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <span style={{ color: STATUS_COLOR[j.status] ?? "var(--muted)", fontSize: 12.5, fontWeight: 700 }}>
                  {j.status.replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--faint)" }}>
                  {new Date(j.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
