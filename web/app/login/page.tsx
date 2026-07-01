import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { authorizeUrl } from "@/lib/auth/cognito";
import { PeakMark } from "@/components/Brand";
import { DEV_MODE } from "@/lib/devMode";
import { devSignIn } from "@/lib/actions/auth";
import { MagicLinkForm } from "@/components/MagicLinkForm";

export const dynamic = "force-dynamic";

// Cognito hosted UI handles both sign-in and self-service sign-up.
// DEV_MODE: a single "Continue as dev user" button bypasses Cognito entirely.
export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect("/");
  const href = DEV_MODE ? null : authorizeUrl("login");
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";
  // Magic-link is gated OFF until SES production access is granted — in the sandbox its email
  // only reaches SES-verified addresses, so a real new user would get a dead-end "check your
  // email" with nothing arriving. While off, Google + hosted-UI password (both work for
  // everyone) are the login paths. To re-enable once SES is out of the sandbox: set the ECS
  // env var MAGIC_LINK_ENABLED="true" (app_env_vars in infra/terraform/main.tf) and redeploy —
  // no code change needed. Read at runtime here (server component), so a redeploy is enough.
  const magicLinkEnabled = process.env.MAGIC_LINK_ENABLED === "true";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Atmospheric glow — ember behind the card */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(600px 600px at 50% 40%, rgba(232,85,45,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 400 }}>
        {/* Brand hero */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "rgba(232,85,45,0.12)",
              border: "1px solid rgba(232,85,45,0.22)",
              marginBottom: 16,
            }}
          >
            <PeakMark size={32} />
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "4px",
              textTransform: "uppercase",
              color: "var(--amber)",
              marginBottom: 10,
            }}
          >
            AI Song Coach
          </div>
          <h1
            className="serif"
            style={{ fontSize: 30, margin: "0 0 8px", lineHeight: 1.15 }}
          >
            Get your song to the{" "}
            <span className="grad-text" style={{ fontStyle: "italic" }}>
              summit.
            </span>
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 14, margin: 0, maxWidth: 300, marginInline: "auto" }}>
            A genre-aware, fame-blind craft grade + your Top 3 fixes to climb higher.
          </p>
        </div>

        {/* Auth card */}
        <div
          className="card"
          style={{ padding: "28px 24px", background: "rgba(255,255,255,0.03)" }}
        >
          {DEV_MODE ? (
            <form action={devSignIn}>
              <button type="submit" className="btn-primary" style={{ marginTop: 0 }}>
                Continue as dev user →
              </button>
              <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 10, textAlign: "center" }}>
                DEV_MODE — local harness, no Cognito.
              </p>
            </form>
          ) : magicLinkEnabled ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Primary: email-only, no password to invent. */}
              <MagicLinkForm />

              {googleEnabled && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
                    <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                    <span style={{ color: "var(--muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                      OR
                    </span>
                    <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                  </div>
                  <a href={authorizeUrl("login", "Google")} className="btn-ghost" style={{ gap: 10 }}>
                    <GoogleIcon />
                    Continue with Google
                  </a>
                </>
              )}

              <a
                href={href!}
                style={{
                  textAlign: "center",
                  fontSize: 11.5,
                  color: "var(--muted)",
                  textDecoration: "underline",
                  marginTop: 2,
                }}
              >
                Have a password? Sign in that way instead
              </a>
            </div>
          ) : googleEnabled ? (
            // Magic-link off (SES sandbox): Google primary + hosted-UI email/password, both of
            // which work for any new user. This is the pre-magic-link login layout.
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href={authorizeUrl("login", "Google")} className="btn-primary" style={{ gap: 10 }}>
                <GoogleIcon />
                Continue with Google
              </a>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                <span style={{ color: "var(--muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                  OR
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              </div>
              <a href={href!} className="btn-ghost">
                Continue with email →
              </a>
            </div>
          ) : (
            <a href={href!} className="btn-primary">
              Get started →
            </a>
          )}

          <p
            style={{
              color: "var(--muted)",
              fontSize: 11.5,
              textAlign: "center",
              marginTop: 18,
              marginBottom: 0,
            }}
          >
            By signing in you agree to our{" "}
            <a href="/legal/terms" style={{ color: "var(--amber)", textDecoration: "underline" }}>
              Terms
            </a>{" "}
            &amp;{" "}
            <a href="/legal/privacy" style={{ color: "var(--amber)", textDecoration: "underline" }}>
              Privacy Policy
            </a>
            .
          </p>
        </div>

        {/* Three feature hooks */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 12,
            marginTop: 24,
          }}
        >
          {[
            { icon: "🎵", label: "Music grade", note: "Mix, arrangement & production" },
            { icon: "✍️", label: "Lyrics grade", note: "Melody, phrasing & meaning" },
            { icon: "🧭", label: "Top 3 fixes", note: "Exact moves to climb higher" },
          ].map((f) => (
            <div
              key={f.label}
              className="card"
              style={{ padding: "12px 10px", textAlign: "center" }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{f.label}</div>
              <div style={{ color: "var(--muted)", fontSize: 11 }}>{f.note}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
