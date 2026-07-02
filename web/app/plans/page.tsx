import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/auth/session";
import { authorizeUrl } from "@/lib/auth/cognito";
import { Brand } from "@/components/Brand";
import { PlansClient } from "@/components/PlansClient";
import { PlansFaq } from "@/components/PlansFaq";
import { LegalFooter } from "@/components/LegalFooter";
import { TrackEvent } from "@/components/TrackEvent";

// PUBLIC pricing page — no auth wall (a login redirect here was a conversion ship-blocker;
// the homepage CTA lands on visible prices). Still dynamic: signed-in users get the live
// Stripe checkout, signed-out users get the same cards with a sign-in CTA that carries the
// selected plan through Cognito state (see auth/callback).
export const dynamic = "force-dynamic";

const TITLE = "Plans & Pricing — $9 Summit Pass or $19/mo Season Pass · Cumbre";
const DESCRIPTION =
  "Simple pricing: a $9 one-time Summit Pass for one full route report, or a $19/month Season Pass for unlimited reports. You're only charged after a successful, clean analysis.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/plans" },
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { title: TITLE, description: DESCRIPTION },
};

// Card copy shared by the signed-out (server-rendered) view; the signed-in PlansClient
// mirrors the same bullets. Content is bound to the real report contract (score, Music +
// Lyrics grades, Top 3 fixes, energy map, mix report).
const CARDS = [
  {
    id: "summit" as const,
    label: "Summit Pass",
    price: "$9",
    sub: "one-time",
    tagline: "1 full route report",
    bullets: ["0–100 summit score", "Music + Lyrics grades", "Top 3 fixes", "Energy map", "Mix report"],
    cta: "Start with one song →",
    badge: null,
  },
  {
    id: "season" as const,
    label: "Season Pass",
    price: "$19",
    sub: "/ month",
    tagline: "Unlimited reports",
    bullets: [
      "Everything in Summit",
      "Re-score after your fixes",
      "Track your climb over time",
      "Cancel anytime",
    ],
    cta: "Go unlimited →",
    badge: "BEST FOR FINISHING AN EP",
  },
];

function TrustBadges() {
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
      {[
        "💳 You're only charged after a successful, clean analysis.",
        "🔒 Audio deleted after analysis — never stored, never used for training.",
      ].map((t) => (
        <div
          key={t}
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            padding: "9px 12px",
            border: "1px solid var(--line-soft)",
            borderRadius: 10,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          {t}
        </div>
      ))}
    </div>
  );
}

export default async function PlansPage({ searchParams }: { searchParams: { plan?: string } }) {
  const user = await getUser();
  const initialPlan = searchParams.plan === "summit" || searchParams.plan === "season" ? searchParams.plan : undefined;

  return (
    <main className="frame">
      <TrackEvent event="plans_view" />
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/"
            className="btn-ghost"
            aria-label="Back to home"
            style={{ width: 36, height: 36, padding: 0, borderRadius: 999 }}
          >
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

      {user ? (
        <PlansClient
          paymentLinks={{
            summit: process.env.NEXT_PUBLIC_STRIPE_SUMMIT_URL,
            season: process.env.NEXT_PUBLIC_STRIPE_SEASON_URL,
          }}
          userSub={user.sub}
          userEmail={user.email}
          initialSelected={initialPlan}
        />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {CARDS.map((p) => (
            <div
              key={p.id}
              className="card"
              style={{
                padding: "18px 20px",
                position: "relative",
                background: p.id === "season" ? "var(--warm)" : "var(--card)",
                boxShadow: p.id === "season" ? "inset 0 0 0 1.5px #f6c64a" : "none",
              }}
            >
              {p.badge && (
                <span
                  style={{
                    position: "absolute",
                    top: -9,
                    right: 16,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: 1,
                    color: "#1a1205",
                    background: "var(--grad)",
                    borderRadius: 999,
                    padding: "3px 9px",
                    fontWeight: 700,
                  }}
                >
                  {p.badge}
                </span>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span className="serif" style={{ fontSize: 20 }}>
                  {p.label}
                </span>
                <span>
                  <b style={{ fontSize: 22 }}>{p.price}</b>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}> {p.sub}</span>
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1.2, color: "var(--amber)", marginTop: 4 }}>
                {p.tagline.toUpperCase()}
              </div>
              <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {p.bullets.map((b) => (
                  <li key={b} style={{ color: "var(--muted)", fontSize: 13.5, display: "flex", gap: 8 }}>
                    <span style={{ color: "var(--gold)" }}>▲</span> {b}
                  </li>
                ))}
              </ul>
              {/* Sign-in first (entitlement is account-bound); state carries the plan so the
                  callback lands back on /plans with this card pre-selected for checkout. */}
              <a href={authorizeUrl(`plan:${p.id}`)} className="btn-primary" style={{ marginTop: 16 }}>
                {p.cta}
              </a>
            </div>
          ))}
        </div>
      )}

      <TrustBadges />

      <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, marginTop: 16 }}>
        Secure checkout powered by Stripe.
      </p>
      {user && (
        <Link href="/upload" className="btn-ghost" style={{ marginTop: 12 }}>
          Already have a pass — start climbing
        </Link>
      )}

      <PlansFaq />

      <LegalFooter />
    </main>
  );
}
