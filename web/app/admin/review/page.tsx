import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { listOpenReviewsEnhanced } from "@/lib/queries";
import { Brand } from "@/components/Brand";
import { KeyboardQueue } from "./KeyboardQueue";

export const dynamic = "force-dynamic";

export default async function AdminReviewPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/");

  const rows = await listOpenReviewsEnhanced();

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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Human review queue</h1>
        {rows.some((r) => {
          const ageHours = (Date.now() - new Date(r.created_at).getTime()) / 3_600_000;
          return ageHours >= 4;
        }) && (
          <span style={{ fontSize: 12, color: "var(--bad)", fontWeight: 700, border: "1px solid var(--bad)", borderRadius: 99, padding: "3px 10px" }}>
            SLA breach — items &gt;4h
          </span>
        )}
      </div>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
        Charges only happen after a clean auto pass — approving clears the flag and delivers results; rejecting marks the job failed.
      </p>

      <KeyboardQueue rows={rows} />
    </main>
  );
}
