import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { listOpenReviews } from "@/lib/queries";
import { Brand } from "@/components/Brand";
import { ReviewActions } from "./ReviewActions";

export const dynamic = "force-dynamic";

export default async function AdminReviewPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/");

  const rows = await listOpenReviews();

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px 80px" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <Brand />
        <span style={{ color: "var(--muted)", fontSize: 13 }}>Review console · {admin.email}</span>
      </header>

      <Link href="/admin" style={{ color: "var(--muted)", fontSize: 13 }}>
        ‹ Back to dashboard
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>Human review queue</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
        {rows.length} open item{rows.length === 1 ? "" : "s"}. Charges only happen after a clean
        auto pass, so rejecting here never leaves a user wrongly billed.
      </p>

      {rows.length === 0 ? (
        <p style={{ color: "var(--muted)", marginTop: 24 }}>Queue is clear. 🎉</p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                background: "var(--card)",
                border: "1px solid var(--line)",
                borderRadius: 14,
                padding: "16px 18px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    color: "var(--warn)",
                  }}
                >
                  {r.category.replace(/_/g, " ")}
                </span>
                <span style={{ color: "var(--muted)", fontSize: 12 }}>
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12, margin: "8px 0" }}>
                job {r.job_id}
              </div>
              <pre
                style={{
                  background: "var(--bg2)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 12,
                  color: "#cdd9f5",
                  overflowX: "auto",
                  margin: 0,
                }}
              >
                {JSON.stringify(r.payload, null, 2)}
              </pre>
              <ReviewActions reviewId={r.id} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
