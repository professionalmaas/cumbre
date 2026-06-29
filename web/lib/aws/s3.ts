import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DEV_MODE } from "@/lib/devMode";
import { devExists, devDelete } from "@/lib/devStorage";

// Uploads bucket holds audio transiently; objects are deleted after analysis and the
// bucket also has a 1-day lifecycle expiry as a backstop. Region/creds come from the
// task role (no static keys).
//
// DEV_MODE: the bucket is replaced by web/.dev-uploads/ on local disk (lib/devStorage).
// presignUpload returns a same-origin /api/dev/upload URL the browser PUTs to; the
// exists/delete helpers below hit the local dir. The S3 path is the non-DEV default.
const region = process.env.AWS_REGION ?? "us-east-1";
let _s3: S3Client | null = null;
function s3(): S3Client {
  if (!_s3) _s3 = new S3Client({ region });
  return _s3;
}

export function uploadBucket(): string {
  const b = process.env.S3_UPLOAD_BUCKET;
  if (!b) throw new Error("S3_UPLOAD_BUCKET is not set");
  return b;
}

// Presigned PUT the browser uploads to directly (never proxied through the app).
// DEV_MODE: there's no S3 — return a same-origin route the browser PUTs the file to.
export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 300
): Promise<string> {
  if (DEV_MODE) return `/api/dev/upload?key=${encodeURIComponent(key)}`;
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: uploadBucket(), Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

// Presigned GET the worker/fingerprint use to download the audio.
export async function presignDownload(key: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: uploadBucket(), Key: key }), {
    expiresIn,
  });
}

export async function objectExists(key: string): Promise<boolean> {
  if (DEV_MODE) return devExists(key);
  try {
    await s3().send(new HeadObjectCommand({ Bucket: uploadBucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (DEV_MODE) return devDelete(key);
  await s3().send(new DeleteObjectCommand({ Bucket: uploadBucket(), Key: key }));
}
