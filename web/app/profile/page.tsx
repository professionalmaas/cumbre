import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth/session";
import { getEntitlement } from "@/lib/entitlement";
import { listJobs } from "@/lib/queries";
import { signOut } from "@/lib/actions/auth";
import { PeakMark } from "@/components/Brand";
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

function initials(email: string | undefined): string {
  if (!email) return "?";
  const parts = email.split("@")[0].split(/[._-]/);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

export default async function ProfilePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const [ent, jobs] = await Promise.all([
    getEntitlement(user.sub, user.email ?? undefined),
    listJobs(user.sub, 20),
  ]);

  const avatar = initials(user.email ?? undefined);
  const creditLabel = ent.isAdmin
    ? "Admin · unlimited analyses"
    : ent.subscriptionActive
    ? "Season Pass · unlimited analyses"
    : `${ent.credits} Summit credit${ent.credits === 1 ? "" : "s"} remaining`;

  return (
    <main className="frame">
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 8,
        }}
      >
        <Link href="/" aria-label="Back to home" style={{ display: "flex", alignItems: "center" }}>
          <PeakMark size={22} />
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              background: "transparent",
              border: "1px solid var(--line-strong)",
              color: "var(--muted)",
              borderRadius: 999,
              padding: "7px 14px",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.5px",
            }}
          >
            Sign out
          </button>
        </form>
      </header>

      {/* Profile card */}
      <div className="card" style={{ marginTop: 24, padding: "20px 20px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Avatar */}
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "linear-gradient(135deg, #e8552d, #f6c64a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 16,
              color: "#1a1205",
              flexShrink: 0,
              fontFamily: "var(--font-mono)",
            }}
          >
            {avatar}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user.email ?? "Your account"}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 3,
              }}
            >
              {ent.isAdmin && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    background: "linear-gradient(135deg,rgba(232,85,45,0.2),rgba(246,198,74,0.2))",
                    border: "1px solid rgba(246,198,74,0.3)",
                    borderRadius: 6,
                    padding: "1px 7px",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: "var(--gold)",
                  }}
                >
                  ★ Admin
                </span>
              )}
              <span style={{ color: "var(--muted)", fontSize: 13 }}>{creditLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <Link href="/upload" className="btn-primary" style={{ flex: 1, minWidth: 140 }}>
          Climb a track →
        </Link>
        {ent.subscriptionActive && !ent.isAdmin && <ManageBillingButton />}
        {ent.isAdmin && (
          <Link
            href="/admin"
            className="btn-ghost"
            style={{ flex: "0 0 auto" }}
          >
            Admin console
          </Link>
        )}
      </div>

      {/* Climb history */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "28px 0 10px" }}>
        <h2 className="serif" style={{ fontSize: 20, margin: 0 }}>
          Your climbs
        </h2>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--muted)",
          }}
        >
          {jobs.length} total
        </span>
      </div>

      {jobs.length === 0 ? (
        <div
          className="card"
          style={{ padding: 28, textAlign: "center" }}
        >
          <div style={{ fontSize: 32, marginBottom: 10 }}>🏔️</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No climbs yet</div>
          <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "0 0 16px" }}>
            Upload a track to get your first summit score.
          </p>
          <Link href="/upload" className="btn-primary" style={{ display: "inline-flex", width: "auto", padding: "12px 20px" }}>
            Upload your first track →
          </Link>
        </div>
      ) : (
        <div className="card" style={{ padding: "2px 16px" }}>
          {jobs.map((j, i) => {
            const s = STATUS[j.status] ?? STATUS.queued;
            const row = (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 0",
                  borderBottom: i < jobs.length - 1 ? "1px solid var(--line-soft)" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {/* Track icon */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "var(--warm)",
                      border: "1px solid var(--line)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: 14,
                    }}
                  >
                    🎵
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {j.original_filename ?? "Untitled track"}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10.5,
                        color: "var(--muted)",
                        marginTop: 1,
                      }}
                    >
                      {new Date(j.created_at).toLocaleDateString()} · {j.genre}
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    color: s.color,
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
                  {s.text}
                </span>
              </div>
            );
            return j.status === "done" ? (
              <Link key={j.id} href={`/report/${j.id}`} style={{ display: "block" }}>
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
