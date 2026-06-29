import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth/session";
import { getEntitlement } from "@/lib/entitlement";
import { listJobs } from "@/lib/queries";
import { signOut } from "@/lib/actions/auth";
import { Brand } from "@/components/Brand";
import { ManageBillingButton } from "@/components/ManageBillingButton";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { text: string; color: string }> = {
  queued: { text: "Queued", color: "var(--muted)" },
  running: { text: "Climbing…", color: "var(--orange)" },
  needs_review: { text: "In review", color: "var(--gold)" },
  done: { text: "Ready", color: "#36d399" },
  failed: { text: "Failed", color: "#f87272" },
  rejected: { text: "Rejected", color: "#f87272" },
};

export default async function ProfilePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const [ent, jobs] = await Promise.all([getEntitlement(user.sub), listJobs(user.sub, 20)]);

  return (
    <main className="frame">
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" className="btn-ghost" aria-label="Back to home" style={{ width: 36, height: 36, padding: 0, borderRadius: 999 }}>
            ‹
          </Link>
          <Brand />
        </div>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              background: "transparent",
              border: "1px solid var(--line-strong)",
              color: "var(--muted)",
              borderRadius: 999,
              padding: "7px 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </form>
      </header>

      <div className="eyebrow" style={{ marginTop: 24 }}>
        Summit log
      </div>
      <h1 className="serif" style={{ fontSize: 30, margin: "8px 0 4px" }}>
        {user.email ?? "Your climbs"}
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "0 0 16px" }}>
        {ent.subscriptionActive ? "Season Pass · unlimited analyses" : `${ent.credits} Summit credit${ent.credits === 1 ? "" : "s"} remaining`}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link href="/upload" className="btn-primary">
          Climb another track →
        </Link>
        {ent.subscriptionActive && <ManageBillingButton />}
      </div>

      <h2 className="serif" style={{ fontSize: 19, margin: "30px 0 10px" }}>
        Your climbs
      </h2>
      {jobs.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>No climbs yet — upload a track to start your log.</p>
      ) : (
        <div className="card" style={{ padding: "2px 16px" }}>
          {jobs.map((j) => {
            const s = STATUS[j.status] ?? STATUS.queued;
            const row = (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "13px 0",
                  borderBottom: "1px solid var(--line-soft)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {j.original_filename ?? "Untitled track"}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                    {new Date(j.created_at).toLocaleDateString()} · {j.genre}
                  </div>
                </div>
                <span style={{ color: s.color, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{s.text}</span>
              </div>
            );
            return j.status === "done" ? (
              <Link key={j.id} href={`/report/${j.id}`}>
                {row}
              </Link>
            ) : (
              <div key={j.id}>{row}</div>
            );
          })}
        </div>
      )}
    </main>
  );
}
