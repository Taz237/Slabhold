/**
 * One crash or error report, from the browser or the iPhone app, to
 * /api/client-error and on to the Vercel logs. Both sides scrub with these
 * helpers: no emails, tokens, query strings, handles or long user text.
 */

export const REPORT_KINDS = ["error", "unhandledrejection", "boundary", "global-boundary"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export type ClientErrorReport = {
  kind: ReportKind;
  message: string;
  stack: string | null;
  route: string;
  version: string;
  platform: "ios" | "web";
  digest: string | null;
};

export const MAX_MESSAGE = 300;
export const MAX_STACK_LINES = 8;
const MAX_STACK_LINE = 200;

/** Strip anything personal or secret from free text, then cap it. */
export function scrubText(value: string, max = MAX_MESSAGE): string {
  return value
    .replace(/(https?:\/\/[^\s?#)"'`]+)[?#][^\s)"'`]*/g, "$1")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(/\b(Bearer|Basic)\s+\S+/gi, "$1 [token]")
    .replace(/\b(?:sk|pk|rk)_(?:live|test)_\w+/g, "[token]")
    .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, "[token]")
    .replace(/"[^"\n]{24,}"/g, '"[text]"')
    .replace(/'[^'\n]{24,}'/g, "'[text]'")
    .replace(/\s+/g, (space) => (space.includes("\n") ? "\n" : " "))
    .trim()
    .slice(0, max);
}

/** The top few frames of a stack, scrubbed. Null when there is none. */
export function shortStack(stack: string | null | undefined): string | null {
  if (!stack) return null;
  const lines = stack
    .split("\n")
    .map((line) => scrubText(line.trim(), MAX_STACK_LINE))
    .filter(Boolean)
    .slice(0, MAX_STACK_LINES);
  return lines.length ? lines.join("\n") : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE_ROOTS = new Set(["u", "i"]);

/** The page's path with no query, hash, ids or handles: "/u/:username/followers". */
export function normalizeRoute(value: string): string {
  let path = value || "/";
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    path = "/";
  }
  path = path.split(/[?#]/)[0] || "/";
  const parts = path.split("/").filter(Boolean).slice(0, 6);
  const out = parts.map((part, index) => {
    if (index === 1 && HANDLE_ROOTS.has(parts[0])) return ":username";
    if (UUID.test(part) || /^\d+$/.test(part) || (index === 1 && parts[0] === "posts")) return ":id";
    return scrubText(part, 60);
  });
  return `/${out.join("/")}`;
}

function cleanVersion(value: unknown): string {
  return typeof value === "string" && /^[\w.-]{1,40}$/.test(value) ? value : "unknown";
}

function cleanDigest(value: unknown): string | null {
  return typeof value === "string" && /^[\w-]{1,32}$/.test(value) ? value : null;
}

/** A report from the wire, checked and scrubbed again. Null when it isn't one. */
export function parseClientErrorReport(input: unknown): ClientErrorReport | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (!REPORT_KINDS.includes(raw.kind as ReportKind)) return null;
  if (typeof raw.message !== "string") return null;
  return {
    kind: raw.kind as ReportKind,
    message: scrubText(raw.message) || "(no message)",
    stack: typeof raw.stack === "string" ? shortStack(raw.stack) : null,
    route: normalizeRoute(typeof raw.route === "string" ? raw.route : "/"),
    version: cleanVersion(raw.version),
    platform: raw.platform === "ios" ? "ios" : "web",
    digest: cleanDigest(raw.digest),
  };
}

/**
 * A small in-memory limit: `perKey` reports per sender and `total` overall,
 * per window. Each server instance keeps its own, which is enough to stop
 * one broken phone (or a script) from flooding the logs.
 */
export function createRateLimiter({
  perKey,
  total,
  windowMs,
  now = Date.now,
}: {
  perKey: number;
  total: number;
  windowMs: number;
  now?: () => number;
}): (key: string) => boolean {
  let windowStart = now();
  let used = 0;
  const counts = new Map<string, number>();
  return (key: string) => {
    const at = now();
    if (at - windowStart > windowMs) {
      windowStart = at;
      used = 0;
      counts.clear();
    }
    if (used >= total) return false;
    const count = counts.get(key) ?? 0;
    if (count >= perKey) return false;
    counts.set(key, count + 1);
    used += 1;
    return true;
  };
}
