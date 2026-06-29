import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { DEV_MODE } from "@/lib/devMode";
import { devWrite } from "@/lib/devStorage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// DEV_MODE-only local replacement for the S3 presigned PUT. The browser PUTs the raw
// audio bytes here (?key=<storageKey>); we write them under web/.dev-uploads/<key>.
// The key is namespaced by the dev user's sub, and we refuse keys outside that prefix
// so a session can only write its own objects (mirrors the per-user S3 key scheme).
export async function PUT(request: Request): Promise<NextResponse> {
  if (!DEV_MODE) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key || !key.startsWith(`${user.sub}/`)) {
    return NextResponse.json({ error: "bad_key" }, { status: 400 });
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: "empty" }, { status: 400 });

  await devWrite(key, buf);
  return NextResponse.json({ ok: true, bytes: buf.length });
}
