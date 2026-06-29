import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION ?? "us-east-1";
let _s3: S3Client | null = null;
function s3(): S3Client {
  if (!_s3) _s3 = new S3Client({ region });
  return _s3;
}

function bucket(): string {
  const b = process.env.S3_UPLOAD_BUCKET;
  if (!b) throw new Error("S3_UPLOAD_BUCKET is not set");
  return b;
}

export async function head(key: string): Promise<{ exists: boolean; size: number }> {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { exists: true, size: r.ContentLength ?? 0 };
  } catch {
    return { exists: false, size: 0 };
  }
}

export async function presignDownload(key: string, expiresIn = 300): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
