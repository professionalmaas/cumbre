"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmMagicLink } from "@/lib/actions/magicLink";

// Redemption happens ONLY on click, never on page load — an email client or security
// scanner that GETs this page to prescan the link never triggers this, so it can't burn
// the one-time-use token before the real user clicks it.
export function ConfirmMagicLinkButton({ requestId, token }: { requestId: string; token: string }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    startTransition(async () => {
      const res = await confirmMagicLink(requestId, token);
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <button type="button" onClick={onClick} disabled={pending} className="btn-primary" style={{ marginTop: 0 }}>
        {pending ? "Confirming…" : "Confirm sign-in →"}
      </button>
      {error && <p style={{ color: "#f87272", fontSize: 12, marginTop: 10, marginBottom: 0 }}>{error}</p>}
    </>
  );
}
