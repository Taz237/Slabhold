import { fileToDataUrl } from "./storage";

/**
 * `image/*` plus extensions so HEIC/HEIF still appear when the OS leaves the MIME empty.
 * Library inputs use this with no `capture` attribute.
 */
export const PHOTO_ACCEPT = "image/*,.heic,.heif";

const PHOTO_NAME = /\.(avif|bmp|gif|hei[cf]|jpe?g|png|tiff?|webp)$/i;
const HEIC_NAME = /\.hei[cf]$/i;

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

export const PHOTO_TYPE_ERROR = "Choose a JPEG, PNG, HEIC, or WebP photo.";
export const PHOTO_READ_ERROR = "Couldn't read that photo. Try again.";
export const PHOTO_TOO_LARGE_ERROR = "That photo is too large. Choose one under 25 MB.";
export const PHOTO_HEIC_ERROR = "This browser can't open HEIC photos. Choose a JPEG or PNG.";

/** A compressed card JPEG stays under this. Anything larger is the original file. */
const MAX_COMPRESSED_CHARS = 1_500_000;

export function isAcceptedPhoto(file: { type: string; name: string }): boolean {
  const type = file.type.toLowerCase().trim();
  if (type.startsWith("image/")) return true;
  if (type === "" || type === "application/octet-stream") return PHOTO_NAME.test(file.name);
  return false;
}

export function isHeicPhoto(file: { type: string; name: string }): boolean {
  const type = file.type.toLowerCase().trim();
  if (type.includes("heic") || type.includes("heif")) return true;
  return HEIC_NAME.test(file.name);
}

/** Same compress path as every other photo. Rejects instead of keeping a raw HEIC or a huge original. */
export async function readPhotoFile(file: File, maxSize = 720): Promise<string> {
  if (!isAcceptedPhoto(file)) throw new Error(PHOTO_TYPE_ERROR);
  if (file.size > MAX_PHOTO_BYTES) throw new Error(PHOTO_TOO_LARGE_ERROR);
  const heic = isHeicPhoto(file);
  let dataUrl: string;
  try {
    dataUrl = await fileToDataUrl(file, maxSize, { strict: true });
  } catch {
    throw new Error(heic ? PHOTO_HEIC_ERROR : PHOTO_READ_ERROR);
  }
  if (!dataUrl.startsWith("data:image/jpeg") || dataUrl.length > MAX_COMPRESSED_CHARS) {
    throw new Error(heic ? PHOTO_HEIC_ERROR : PHOTO_READ_ERROR);
  }
  return dataUrl;
}
