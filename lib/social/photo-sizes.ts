/**
 * Natural sizes of post photos this tab has already loaded. The post page
 * reads them to give a photo its real shape before it paints (no letterbox,
 * no jump), and the photo viewer to size the fullscreen photo at once.
 */
export type PhotoSize = { width: number; height: number };

const LIMIT = 400;
const sizes = new Map<string, PhotoSize>();

export function rememberPhotoSize(src: string, width: number, height: number): void {
  if (!src || !(width > 0) || !(height > 0)) return;
  sizes.delete(src);
  sizes.set(src, { width, height });
  if (sizes.size > LIMIT) {
    const oldest = sizes.keys().next().value;
    if (oldest !== undefined) sizes.delete(oldest);
  }
}

export function knownPhotoSize(src: string): PhotoSize | null {
  return sizes.get(src) ?? null;
}

/** For tests. */
export function forgetPhotoSizes(): void {
  sizes.clear();
}
