import { NextResponse } from "next/server";

// Shallow health check for the ALB target group + ECS container health check.
// Intentionally does NOT touch RDS/Stripe/etc — a dependency blip must not cycle tasks.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, service: "cumbre-web" });
}
