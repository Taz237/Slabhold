import { photoLookFromPixels, type PhotoLook } from "./photo-look";

/** Wide enough to see the border band, small enough to read in a few milliseconds. */
const READ_WIDTH = 160;

/**
 * The scan's straightened crop, drawn small on a canvas on the phone and read for its look
 * (photo-look.ts). Nothing leaves the phone. Null whenever the picture can't be drawn or read.
 */
export async function readPhotoLook(dataUrl: string): Promise<PhotoLook | null> {
  if (typeof document === "undefined" || typeof Image === "undefined" || !dataUrl.startsWith("data:image/")) return null;
  const image = new Image();
  image.decoding = "async";
  image.src = dataUrl;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) return null;
  const width = Math.min(READ_WIDTH, image.naturalWidth);
  const height = Math.max(1, Math.round((image.naturalHeight / image.naturalWidth) * width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  return photoLookFromPixels(context.getImageData(0, 0, width, height));
}
