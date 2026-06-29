import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { authorizeUrl } from "@/lib/auth/cognito";
import { Brand } from "@/components/Brand";
import { DEV_MODE } from "@/lib/devMode";
import { devSignIn } from "@/lib/actions/auth";

export const dynamic = "force-dynamic";

// Cognito hosted UI handles both sign-in and self-service sign-up.
// DEV_MODE: a single "Continue as dev user" button bypasses Cognito entirely.
export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect("/");
  // authorizeUrl() reads Cognito env that isn't set in dev — only build it in the prod path.
  const href = DEV_MODE ? null : authorizeUrl("login");

  return (
    <main className="frame" style={{ display: "grid", placeItems: "center" }}>
      <div className="card" style={{ width: "100%", padding: 30, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Brand />
        </div>
        <h1 className="serif" style={{ fontSize: 28, margin: "20px 0 6px" }}>
          Get your song to the <span className="grad-text" style={{ fontStyle: "italic" }}>summit.</span>
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
          Sign in or create an account to grade a track and get your Top 3 fixes.
        </p>
        {DEV_MODE ? (
          <form action={devSignIn}>
            <button type="submit" className="btn-primary" style={{ marginTop: 18 }}>
              Continue as dev user →
            </button>
            <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 10 }}>
              DEV_MODE — local harness, no Cognito.
            </p>
          </form>
        ) : process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true" ? (
          <>
            <a href={authorizeUrl("login", "Google")} className="btn-primary" style={{ marginTop: 18 }}>
              Continue with Google
            </a>
            <a href={href!} className="btn-ghost" style={{ marginTop: 10 }}>
              Continue with email →
            </a>
          </>
        ) : (
          <a href={href!} className="btn-primary" style={{ marginTop: 18 }}>
            Continue →
          </a>
        )}
      </div>
    </main>
  );
}
