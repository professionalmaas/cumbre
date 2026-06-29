import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth/session";
import { Brand } from "@/components/Brand";
import { PlansClient } from "@/components/PlansClient";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  // Sign-in before pay (entitlement is tied to the account).
  const user = await getUser();
  if (!user) redirect("/login");

  return (
    <main className="frame">
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" className="btn-ghost" style={{ width: 36, height: 36, padding: 0, borderRadius: 999 }}>
            ‹
          </Link>
          <Brand />
        </div>
      </header>

      <div className="eyebrow" style={{ marginTop: 24 }}>
        Reach the summit
      </div>
      <h1 className="serif" style={{ fontSize: 32, margin: "8px 0 16px" }}>
        Choose your pass
      </h1>

      <PlansClient
        paymentLinks={{
          summit: process.env.NEXT_PUBLIC_STRIPE_SUMMIT_URL,
          season: process.env.NEXT_PUBLIC_STRIPE_SEASON_URL,
        }}
        userSub={user.sub}
        userEmail={user.email}
      />

      <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, marginTop: 16 }}>
        Secure checkout powered by Stripe.
      </p>
      <Link href="/upload" className="btn-ghost" style={{ marginTop: 12 }}>
        Already have a pass — start climbing
      </Link>
    </main>
  );
}
