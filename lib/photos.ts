import { fileToDataUrl } from "./storage";

/**
 * `image/*` plus extensions so HEIC/HEIF still appear when the OS leaves the MIME empty.
 * Library inputs use this with no `capture` attribute.
 */
export const PHOTO_ACCEPT = "image/*,.heic,.heif";

const PHOTO_NAME = /\.(avif|bmp|gif|hei[cf]|jpe?g|png|tiff?|webp)$/i;

export const PHOTO_TYPE_ERROR = "Choose a JPEG, PNG, HEIC, or WebP photo.";
export const PHOTO_READ_ERROR = "Couldn't read that photo. Try again.";

/** A compressed card JPEG stays under this. Anything larger is the original file. */
const MAX_COMPRESSED_CHARS = 1_500_000;

export function isAcceptedPhoto(file: { type: string; name: string }): boolean {
  const type = file.type.toLowerCase().trim();
  if (type.startsWith("image/")) return true;
  if (type === "" || type === "application/octet-stream") return PHOTO_NAME.test(file.name);
  return false;
}

/** Same compress path as every other photo. Rejects instead of keeping a raw HEIC or a huge original. */
export async function readPhotoFile(file: File, maxSize = 720): Promise<string> {
  if (!isAcceptedPhoto(file)) throw new Error(PHOTO_TYPE_ERROR);
  let dataUrl: string;
  try {
    dataUrl = await fileToDataUrl(file, maxSize, { strict: true });
  } catch {
    throw new Error(PHOTO_READ_ERROR);
  }
  if (!dataUrl.startsWith("data:image/jpeg") || dataUrl.length > MAX_COMPRESSED_CHARS) {
    throw new Error(PHOTO_READ_ERROR);
  }
  return dataUrl;
}
