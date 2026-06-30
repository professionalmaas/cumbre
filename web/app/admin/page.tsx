import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { getAdminStats, listOpenReviewsEnhanced, getJobsByDay, getReviewQueueDepth } from "@/lib/queries";
import { Brand } from "@/components/Brand";
import { JobsBarChart } from "@/components/admin/JobsBarChart";
import { ActivityChart } from "@/components/admin/ActivityChart";

export const dynamic = "force-dynamic";

function Stat({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, color: "var(--muted)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div className="serif" style={{ fontSize: 30, marginTop: 4, color: accent ?? "var(--ink)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12 }}>
        <span style={{ color: "var(--muted)" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)" }}>{value.toLocaleString()}</span>
      </div>
      <div style={{ background: "var(--line)", borderRadius: 4, height: 7, overflow: "hidden" }}>
        <div style={{ background: color, width: `${pct}%`, height: "100%", borderRadius: 4, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/");

  const [stats, openReviews, jobsByDay, queueDepth] = await Promise.all([
    getAdminStats(),
    listOpenReviewsEnhanced(),
    getJobsByDay(7),
    getReviewQueueDepth(),
  ]);
  const { funnel, feedback, jobsByStatus, recent } = stats;

  const fbTotal = feedback.up + feedback.down;
  const fixSatisfaction = fbTotal > 0 ? Math.round((feedback.up / fbTotal) * 100) : null;

  const slaBreached = openReviews.filter(
    (r) => (Date.now() - new Date(r.created_at).getTime()) / 3_600_000 >= 4
  ).length;

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "28px 20px 80px" }}>
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
          Review queue
          {queueDepth > 0 && (
            <span style={{
              marginLeft: 8,
              background: slaBreached > 0 ? "var(--bad)" : "var(--gold)",
              color: "#000",
              borderRadius: 99,
              padding: "1px 8px",
              fontSize: 11,
              fontWeight: 700,
            }}>
              {queueDepth}
            </span>
          )}
          {" →"}
        </Link>
      </div>

      {/* ── Row 1: Pipeline KPIs ── */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", margin: "28px 0 10px", letterSpacing: 0.4 }}>
        PIPELINE HEALTH
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <Stat label="Signups" value={funnel.signups} />
        <Stat
          label="Paid users"
          value={funnel.paid}
          sub={funnel.signups > 0 ? `${Math.round((funnel.paid / funnel.signups) * 100)}% conversion` : undefined}
          accent={funnel.paid > 0 ? "#22c55e" : undefined}
        />
        <Stat
          label="Reports delivered"
          value={funnel.delivered}
          sub={funnel.paid > 0 ? `${Math.round((funnel.delivered / funnel.paid) * 100)}% of paid` : undefined}
        />
        <Stat
          label="Review queue"
          value={queueDepth}
          sub={slaBreached > 0 ? `${slaBreached} breaching SLA` : queueDepth === 0 ? "all clear" : "open"}
          accent={slaBreached > 0 ? "var(--bad)" : queueDepth > 10 ? "var(--warn)" : undefined}
        />
      </div>

      {/* ── Funnel visual ── */}
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px", marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 16 }}>
          Conversion funnel
        </div>
        <FunnelBar label="Signups" value={funnel.signups} max={funnel.signups} color="#9ca3af" />
        <FunnelBar label="Paid" value={funnel.paid} max={funnel.signups} color="#22c55e" />
        <FunnelBar label="Delivered" value={funnel.delivered} max={funnel.signups} color="#a78bfa" />
      </div>

      {/* ── Row 2: Jobs by status (bar chart) ── */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", margin: "28px 0 10px", letterSpacing: 0.4 }}>
        JOBS BY STATUS
      </h2>
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 8px 8px 4px" }}>
        <JobsBarChart data={jobsByStatus} />
      </div>

      {/* ── Row 3: Activity over time ── */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", margin: "28px 0 10px", letterSpacing: 0.4 }}>
        ACTIVITY — LAST 7 DAYS
      </h2>
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 8px 8px 0" }}>
        <ActivityChart data={jobsByDay} />
      </div>

      {/* ── Row 4: Feedback ── */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", margin: "28px 0 10px", letterSpacing: 0.4 }}>
        FEEDBACK (ACTIVE-LEARNING SIGNAL)
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <Stat label="Fix · helpful" value={feedback.up} accent="#22c55e" />
        <Stat label="Fix · missed" value={feedback.down} accent="#ef4444" />
        <Stat
          label="Fix satisfaction"
          value={fixSatisfaction === null ? "—" : `${fixSatisfaction}%`}
          sub={fbTotal > 0 ? `${fbTotal} votes` : "no votes yet"}
          accent={fixSatisfaction !== null && fixSatisfaction >= 70 ? "#22c55e" : fixSatisfaction !== null && fixSatisfaction < 50 ? "var(--bad)" : undefined}
        />
        <Stat label="Report ▲ / ▼" value={`${feedback.reportUp} / ${feedback.reportDown}`} />
      </div>

      {/* ── Row 5: Recent activity ── */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", margin: "28px 0 10px", letterSpacing: 0.4 }}>
        RECENT ACTIVITY
      </h2>
      {recent.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Nothing yet.</p>
      ) : (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "2px 16px" }}>
          {recent.map((j) => {
            const statusColor: Record<string, string> = {
              queued: "var(--muted)", running: "var(--orange)", needs_review: "var(--gold)",
              done: "#36d399", failed: "#f87272", rejected: "#f87272",
            };
            return (
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
                <div style={{ minWidth: 0, display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
                    {j.id.slice(0, 8)}
                  </span>
                  {j.genre && (
                    <span style={{ fontSize: 11, color: "var(--faint)", padding: "1px 7px", border: "1px solid var(--line)", borderRadius: 99 }}>
                      {j.genre}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  <span style={{ color: statusColor[j.status] ?? "var(--muted)", fontSize: 12.5, fontWeight: 700 }}>
                    {j.status.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--faint)" }}>
                    {new Date(j.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
