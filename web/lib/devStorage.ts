// DEV_MODE local file storage — the no-AWS replacement for the S3 uploads bucket.
//
// Browser uploads PUT to /api/dev/upload?key=<key> instead of a presigned S3 URL; that
// route writes the bytes under web/.dev-uploads/<key> (gitignored). The inline analyze
// route reads the local file, hands its path to the Python worker, then deletes it —
// mirroring the deliver Lambda's "store features, not audio" guarantee.
//
// Keys look like "<sub>/<songId>.<ext>"; we sanitise to keep everything inside the root.
import { promises as fs } from "fs";
import path from "path";

export const DEV_UPLOAD_ROOT = path.join(process.cwd(), ".dev-uploads");

// Resolve a storage key to an absolute path, refusing anything that escapes the root.
export function devKeyToPath(key: string): string {
  const clean = key.replace(/\\/g, "/").replace(/\.\.+/g, "");
  const full = path.resolve(DEV_UPLOAD_ROOT, clean);
  if (!full.startsWith(path.resolve(DEV_UPLOAD_ROOT))) {
    throw new Error("invalid storage key");
  }
  return full;
}

export async function devWrite(key: string, data: Buffer): Promise<void> {
  const full = devKeyToPath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}

export async function devExists(key: string): Promise<boolean> {
  try {
    const st = await fs.stat(devKeyToPath(key));
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

export async function devDelete(key: string): Promise<void> {
  try {
    await fs.unlink(devKeyToPath(key));
  } catch {
    // best-effort, mirrors the deliver Lambda's tolerant S3 delete
  }
}
