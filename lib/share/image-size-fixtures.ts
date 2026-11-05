/** Test fixtures: the first bytes of real image headers, no pixels. */

function u16be(n: number) {
  return [(n >> 8) & 0xff, n & 0xff];
}
function u32be(n: number) {
  return [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function u24le(n: number) {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
}

/** A JPEG head: SOI, an APP0, optional EXIF orientation, then SOF0. */
export function jpegHead(width: number, height: number, orientation?: number, sof = 0xc0): Uint8Array {
  const app0 = [0xff, 0xe0, ...u16be(16), 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const exif: number[] = [];
  if (orientation) {
    // "Exif\0\0", big-endian TIFF, IFD0 at 8 with one entry: 0x0112 SHORT 1.
    const tiff = [0x4d, 0x4d, 0, 42, ...u32be(8), ...u16be(1), ...u16be(0x0112), ...u16be(3), ...u32be(1), ...u16be(orientation), 0, 0, ...u32be(0)];
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    exif.push(0xff, 0xe1, ...u16be(body.length + 2), ...body);
  }
  const sofSeg = [0xff, sof, ...u16be(17), 8, ...u16be(height), ...u16be(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...exif, ...sofSeg]);
}

export function pngHead(width: number, height: number): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32be(13), 0x49, 0x48, 0x44, 0x52, ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0]);
}

function riff(chunk: string, payload: number[]): Uint8Array {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  const size = 4 + 8 + payload.length;
  return Uint8Array.from([...ascii("RIFF"), size & 0xff, (size >> 8) & 0xff, 0, 0, ...ascii("WEBP"), ...ascii(chunk), payload.length & 0xff, 0, 0, 0, ...payload]);
}

export function webpLossy(width: number, height: number): Uint8Array {
  return riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, width & 0xff, (width >> 8) & 0x3f, height & 0xff, (height >> 8) & 0x3f]);
}

export function webpLossless(width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  return riff("VP8L", [0x2f, w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x3) << 6), (h >> 2) & 0xff, (h >> 10) & 0xf]);
}

export function webpExtended(width: number, height: number): Uint8Array {
  return riff("VP8X", [0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]);
}
