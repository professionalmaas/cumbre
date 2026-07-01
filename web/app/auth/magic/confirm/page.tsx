import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { PeakMark } from "@/components/Brand";
import { ConfirmMagicLinkButton } from "@/components/ConfirmMagicLinkButton";

export const dynamic = "force-dynamic";

export default async function ConfirmMagicLinkPage({
  searchParams,
}: {
  searchParams: { rid?: string; token?: string };
}) {
  const user = await getUser();
  if (user) redirect("/");

  const { rid, token } = searchParams;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
      }}
    >
      <div className="card" style={{ padding: "28px 24px", maxWidth: 380, width: "100%", textAlign: "center" }}>
        <div style={{ display: "inline-flex", marginBottom: 14 }}>
          <PeakMark size={32} />
        </div>
        {rid && token ? (
          <>
            <h1 className="serif" style={{ fontSize: 22, margin: "0 0 8px" }}>
              Confirm sign-in
            </h1>
            <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "0 0 20px" }}>
              Click below to finish signing in to Cumbre.
            </p>
            <ConfirmMagicLinkButton requestId={rid} token={token} />
          </>
        ) : (
          <>
            <h1 className="serif" style={{ fontSize: 22, margin: "0 0 8px" }}>
              Invalid link
            </h1>
            <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>
              This sign-in link is missing required information. Request a new one from the login page.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
