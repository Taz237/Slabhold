import type { ScanCapture } from "@/lib/scan/session";

/**
 * The native card scanner's results (ios-app SlabholdScanner, PR 10): a
 * full-screen camera the collector taps to take (or a library photo picked on
 * the camera screen), a straightened crop and Apple Vision text reading on the
 * phone. Only the read text and the crop come
 * back. The plugin calls live in lib/ios/native.ts, like every Capacitor import;
 * this file only checks what comes back, so no plugin code ships in a route's
 * first load. Builds without the plugin report unavailable, and the scan hub
 * falls back to a photo.
 */

export type RawScan = {
  cancelled?: boolean;
  lines?: unknown;
  backLines?: unknown;
  image?: unknown;
  kind?: unknown;
  border?: unknown;
  /** New keys, all optional, so an older app build still works: each line's next best readings. */
  alternates?: unknown;
  backAlternates?: unknown;
  /** A slab's cert number from its barcode. */
  cert?: unknown;
};

export const SCANNER_PLUGIN = "SlabholdScanner";

const MAX_LINES = 80;
const MAX_LINE_LENGTH = 200;
/** About 4 MB of base64: a 1280px JPEG is far under this. */
const MAX_IMAGE_LENGTH = 4_000_000;

function lines(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((line): line is string => typeof line === "string")
    .slice(0, MAX_LINES)
    .map((line) => line.slice(0, MAX_LINE_LENGTH));
}

const MAX_ALTERNATES = 3;

/** One list of alternates per line, capped like lines. Null when missing or not a list of lists. */
function alternates(value: unknown, count: number): string[][] | null {
  if (!Array.isArray(value) || !value.every((item) => Array.isArray(item))) return null;
  return (value as unknown[][]).slice(0, count).map((list) =>
    list
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, MAX_ALTERNATES)
      .map((item) => item.slice(0, MAX_LINE_LENGTH)),
  );
}

/** A cert number is 7 to 12 digits and nothing else. */
function cert(value: unknown): string | null {
  return typeof value === "string" && /^\d{7,12}$/.test(value) ? value : null;
}

function image(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > MAX_IMAGE_LENGTH) return null;
  if (value.startsWith("data:image/jpeg;base64,") || value.startsWith("data:image/png;base64,")) return value;
  if (/^[A-Za-z0-9+/=]+$/.test(value)) return `data:image/jpeg;base64,${value}`;
  return null;
}

/** A plugin result checked field by field. Null on cancel or anything unusable. */
export function scanCaptureFrom(raw: unknown): ScanCapture | null {
  if (!raw || typeof raw !== "object") return null;
  const scan = raw as RawScan;
  if (scan.cancelled) return null;
  const front = lines(scan.lines);
  if (!front) return null;
  const back = lines(scan.backLines);
  const capture: ScanCapture = {
    lines: front,
    backLines: back,
    image: image(scan.image),
    kind: scan.kind === "card" || scan.kind === "slab" ? scan.kind : null,
    border: borderColorName(scan.border),
  };
  // The newer app build's extras, only when it sent them: an older build's result is unchanged.
  const frontAlternates = alternates(scan.alternates, front.length);
  if (frontAlternates) capture.alternates = frontAlternates;
  const backAlternates = back ? alternates(scan.backAlternates, back.length) : null;
  if (backAlternates) capture.backAlternates = backAlternates;
  const barcode = cert(scan.cert);
  if (barcode) capture.cert = barcode;
  return capture;
}

/**
 * The border's color name from the phone's [hue, saturation, brightness]
 * (each 0...1). Null when it's not a clear color (white, grey, black, washed
 * out): then it never breaks a tie. Pink/Red cards read pink or red.
 */
export function borderColorName(value: unknown): string | null {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((part) => typeof part === "number" && part >= 0 && part <= 1)) {
    return null;
  }
  const [hue, saturation, brightness] = value as number[];
  if (saturation < 0.3 || brightness < 0.25) return null;
  const degrees = hue * 360;
  if (degrees >= 345 || degrees < 12) return "red";
  if (degrees < 40) return "orange";
  if (degrees < 70) return "gold";
  if (degrees < 165) return "green";
  if (degrees < 200) return "aqua";
  if (degrees < 255) return "blue";
  if (degrees < 290) return "purple";
  return "pink";
}
