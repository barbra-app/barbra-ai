import { runtimeEnv } from "@/lib/runtime-env";
import { googleAccessToken } from "@/lib/google/access-token";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — plenty for a profile/event photo.
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Cards never render these larger than this, so anything wider just adds
// weight with no visible benefit. Quality 85 keeps re-compression artifacts
// invisible at normal viewing sizes.
const MAX_DIMENSION_PX = 1920;
const JPEG_QUALITY = 85;

async function optimizeImage(file: File): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const image = sharp(Buffer.from(await file.arrayBuffer())).rotate();
  const metadata = await image.metadata();
  const resized =
    (metadata.width ?? 0) > MAX_DIMENSION_PX || (metadata.height ?? 0) > MAX_DIMENSION_PX
      ? image.resize({ width: MAX_DIMENSION_PX, height: MAX_DIMENSION_PX, fit: "inside", withoutEnlargement: true })
      : image;

  if (file.type === "image/png") return resized.png({ quality: JPEG_QUALITY, compressionLevel: 9 }).toBuffer();
  if (file.type === "image/webp") return resized.webp({ quality: JPEG_QUALITY }).toBuffer();
  return resized.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
}

async function accessToken() {
  let raw = await runtimeEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  const file = await runtimeEnv("FIREBASE_SERVICE_ACCOUNT_FILE");
  if (!raw && file) {
    const { readFile } = await import("node:fs/promises");
    raw = await readFile(file, "utf8");
  }
  return googleAccessToken("https://www.googleapis.com/auth/devstorage.read_write", raw);
}

async function bucket() {
  const bucket = (await runtimeEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET")) ?? (await runtimeEnv("FIREBASE_STORAGE_BUCKET"));
  if (!bucket) throw new Error("FIREBASE_STORAGE_BUCKET_MISSING");
  return bucket;
}

/**
 * Uploads an image server-side via the GCS JSON API (Workers-compatible — no firebase-admin).
*/
export async function uploadPublicImage(path: string, file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("STORAGE_UNSUPPORTED_TYPE");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("STORAGE_FILE_TOO_LARGE");

  const [token, bucketName, optimized] = await Promise.all([accessToken(), bucket(), optimizeImage(file)]);
  const downloadToken = crypto.randomUUID();
  const boundary = crypto.randomUUID();
  const metadata = JSON.stringify({ name: path, metadata: { firebaseStorageDownloadTokens: downloadToken } });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`,
    new Uint8Array(optimized),
    `\r\n--${boundary}--`,
  ]);

  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucketName)}/o?uploadType=multipart`;
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!response.ok) throw new Error(`STORAGE_UPLOAD_FAILED_${response.status}`);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;
}

/**
 * Deletes an object previously returned by uploadPublicImage, given its
 * public download URL. Swallows a 404 (already gone) — anything else throws.
 */
export async function deletePublicImage(downloadUrl: string): Promise<void> {
  const match = downloadUrl.match(/\/o\/([^?]+)/);
  if (!match) return;
  const path = decodeURIComponent(match[1]);

  const [token, bucketName] = await Promise.all([accessToken(), bucket()]);
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`STORAGE_DELETE_FAILED_${response.status}`);
  }
}
