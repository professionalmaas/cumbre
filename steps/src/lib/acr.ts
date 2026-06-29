import crypto from "crypto";
import { presignDownload } from "./s3";

export type AcrPolicy = "Allow" | "Monetize" | "BlockAccess";

// ACRCloud copyright fingerprint. When creds are absent (dev/Phase 1) we default to
// Allow and record that we skipped — never silently block.
export async function fingerprint(
  s3Key: string
): Promise<{ policy: AcrPolicy; note?: string }> {
  const host = process.env.ACRCLOUD_HOST;
  const accessKey = process.env.ACRCLOUD_ACCESS_KEY;
  const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET;
  if (!host || !accessKey || !accessSecret) {
    return { policy: "Allow", note: "acrcloud_not_configured" };
  }

  const url = await presignDownload(s3Key, 300);
  const audio = Buffer.from(await (await fetch(url)).arrayBuffer());
  const sample = audio.subarray(0, Math.min(audio.length, 1_000_000));

  const endpoint = "/v1/identify";
  const dataType = "audio";
  const sigVersion = "1";
  const ts = Math.floor(Date.now() / 1000).toString();
  const stringToSign = ["POST", endpoint, accessKey, dataType, sigVersion, ts].join("\n");
  const signature = crypto
    .createHmac("sha1", accessSecret)
    .update(Buffer.from(stringToSign, "utf-8"))
    .digest("base64");

  const form = new FormData();
  form.append("sample", new Blob([sample]), "sample.bin");
  form.append("sample_bytes", String(sample.length));
  form.append("access_key", accessKey);
  form.append("data_type", dataType);
  form.append("signature_version", sigVersion);
  form.append("signature", signature);
  form.append("timestamp", ts);

  const resp = await fetch(`https://${host}${endpoint}`, { method: "POST", body: form });
  const json = (await resp.json()) as { status?: { code?: number } };
  const code = json.status?.code;
  if (code === 0) return { policy: "BlockAccess", note: "acr_match" };
  return { policy: "Allow", note: code === 1001 ? "no_match" : `acr_code_${code}` };
}
