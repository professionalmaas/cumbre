"use server";

import { redirect } from "next/navigation";
import { clearSession, createDevSession } from "@/lib/auth/session";
import { logoutUrl } from "@/lib/auth/cognito";
import { DEV_MODE, DEV_USER } from "@/lib/devMode";
import { ensureUser } from "@/lib/queries";

// DEV_MODE: sign in as the stub dev user (no Cognito). Provisions the user row + free
// credit exactly like the Cognito callback, so entitlement works without Stripe.
export async function devSignIn() {
  if (!DEV_MODE) redirect("/login");
  await ensureUser(DEV_USER.sub, DEV_USER.email);
  createDevSession();
  redirect("/");
}

// Clear the local session and bounce through Cognito's logout so the hosted-UI
// session is also dropped.
export async function signOut() {
  clearSession();
  if (DEV_MODE) redirect("/login"); // no Cognito hosted UI in dev
  redirect(logoutUrl());
}
