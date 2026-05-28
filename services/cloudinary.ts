import "server-only";

import { v2 as cloudinary } from "cloudinary";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      "Missing Cloudinary credentials. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.",
    );
  }
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  configured = true;
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
}

/**
 * Uploads a PNG buffer to Cloudinary and returns the resulting URL and public_id.
 *
 * @param buffer - raw image bytes
 * @param publicId - desired public_id (typically the QR slug); Cloudinary will overwrite if it exists
 * @param folder - target folder (defaults to env CLOUDINARY_QR_FOLDER or 'qr-codes')
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  publicId: string,
  folder = process.env.CLOUDINARY_QR_FOLDER || "qr-codes",
): Promise<CloudinaryUploadResult> {
  ensureConfigured();

  const result = await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, public_id: publicId, overwrite: true, resource_type: "image", format: "png" },
        (error, uploaded) => {
          if (error || !uploaded) return reject(error ?? new Error("Cloudinary upload failed"));
          resolve(uploaded as { secure_url: string; public_id: string });
        },
      );
      stream.end(buffer);
    },
  );

  return { url: result.secure_url, publicId: result.public_id };
}

/**
 * Deletes an image from Cloudinary. Best-effort: errors are swallowed because callers
 * are usually cleaning up around a DB delete that already succeeded.
 */
export async function deleteImage(publicId: string): Promise<void> {
  ensureConfigured();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch {
    // intentionally ignored
  }
}
