import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth/session";
import { getEntitlement } from "@/lib/entitlement";
import { Brand } from "@/components/Brand";
import { UploadForm } from "@/components/UploadForm";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const ent = await getEntitlement(user.sub, user.email ?? undefined);
  if (!ent.hasAccess) redirect("/plans");

  return (
    <main className="frame">
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" className="btn-ghost" style={{ width: 36, height: 36, padding: 0, borderRadius: 999 }}>
            ‹
          </Link>
          <Brand />
        </div>
        <Link href="/profile" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 2, color: "var(--muted)" }}>
          PROFILE
        </Link>
      </header>

      <div className="eyebrow" style={{ marginTop: 24 }}>
        {ent.subscriptionActive ? "Season Pass · unlimited" : `Summit credits · ${ent.credits}`}
      </div>
      <h1 className="serif" style={{ fontSize: 30, margin: "8px 0 16px" }}>
        Add your track
      </h1>

      <UploadForm />
    </main>
  );
}
