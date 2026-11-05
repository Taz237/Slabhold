/**
 * A photo's pixel size from its first bytes: JPEG SOF, PNG IHDR, WebP VP8/VP8L/VP8X.
 * No decoding and no dependencies. Unknown or cut-off bytes give null, so the
 * caller keeps its portrait default.
 */
export type ImageSize = { width: number; height: number };

/** Read no more than this from a photo to find its size. */
export const IMAGE_HEAD_BYTES = 64 * 1024;

function sized(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

function u16(b: Uint8Array, at: number, little = false): number {
  return little ? b[at]! | (b[at + 1]! << 8) : (b[at]! << 8) | b[at + 1]!;
}

function u32(b: Uint8Array, at: number, little = false): number {
  return little
    ? (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0
    : ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
}

function ascii(b: Uint8Array, at: number, text: string): boolean {
  if (b.length < at + text.length) return false;
  for (let i = 0; i < text.length; i++) if (b[at + i] !== text.charCodeAt(i)) return false;
  return true;
}

/** EXIF orientation from an APP1 payload, or 1. 5 to 8 mean the photo is turned a quarter. */
function exifOrientation(b: Uint8Array, start: number, end: number): number {
  if (!ascii(b, start, "Exif\0\0")) return 1;
  const tiff = start + 6;
  if (tiff + 8 > end) return 1;
  const little = b[tiff] === 0x49;
  const ifd = tiff + u32(b, tiff + 4, little);
  if (ifd + 2 > end) return 1;
  const count = u16(b, ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return 1;
    if (u16(b, entry, little) === 0x0112) return u16(b, entry + 8, little);
  }
  return 1;
}

function jpegSize(b: Uint8Array): ImageSize | null {
  let at = 2;
  let orientation = 1;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) return null;
    const marker = b[at + 1]!;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2;
      continue;
    }
    const length = u16(b, at + 2);
    if (length < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (at + 9 > b.length) return null;
      const height = u16(b, at + 5);
      const width = u16(b, at + 7);
      return orientation >= 5 && orientation <= 8 ? sized(height, width) : sized(width, height);
    }
    if (marker === 0xe1) orientation = exifOrientation(b, at + 4, Math.min(b.length, at + 2 + length));
    at += 2 + length;
  }
  return null;
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (ascii(b, 12, "VP8 ")) {
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return sized(u16(b, 26, true) & 0x3fff, u16(b, 28, true) & 0x3fff);
  }
  if (ascii(b, 12, "VP8L")) {
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const width = 1 + (b[21]! | ((b[22]! & 0x3f) << 8));
    const height = 1 + ((b[22]! >> 6) | (b[23]! << 2) | ((b[24]! & 0x0f) << 10));
    return sized(width, height);
  }
  if (ascii(b, 12, "VP8X")) {
    if (b.length < 30) return null;
    const width = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
    const height = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
    return sized(width, height);
  }
  return null;
}

/** The size in a photo's first bytes, or null when the format or bytes are unknown. */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  const b = bytes;
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return jpegSize(b);
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, "PNG\r\n\x1a\n") && ascii(b, 12, "IHDR")) {
    return sized(u32(b, 16), u32(b, 20));
  }
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return webpSize(b);
  return null;
}

/**
 * Read a body until its size is known, up to IMAGE_HEAD_BYTES. The caller
 * cancels the body after; this only reads.
 */
export async function readImageSize(body: ReadableStream<Uint8Array> | null): Promise<ImageSize | null> {
  if (!body) return null;
  const reader = body.getReader();
  let head = new Uint8Array(0);
  try {
    while (head.length < IMAGE_HEAD_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const next = new Uint8Array(Math.min(IMAGE_HEAD_BYTES, head.length + value.length));
      next.set(head);
      next.set(value.subarray(0, next.length - head.length), head.length);
      head = next;
      const size = imageSize(head);
      if (size) return size;
    }
    return imageSize(head);
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
