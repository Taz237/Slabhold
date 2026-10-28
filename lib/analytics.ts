import { track, type BeforeSendEvent } from "@vercel/analytics";

/**
 * Hobby hides custom events in the dashboard. These calls stay so an upgrade records them.
 * Only short, non-identifying values are sent.
 */
const ALLOWED_PROP_KEYS = ["button", "utm_source", "utm_medium", "utm_campaign", "source", "method"] as const;

const BUTTONS = new Set(["signup", "login"]);

/** signup_started and follow attribution. Any other source is dropped. */
const SOURCES = new Set(["card_comps", "owners", "hunters", "card_owners", "card_hunters", "badge", "card"]);

/** How a share went out: the native sheet, X, a copied link, or a saved image. */
const SHARE_METHODS = new Set(["native", "x", "copy", "image"]);

/** 1–48 characters. Blocks emails, sentences, urls, and query strings. */
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/;

const EVENT_NAME = /^[a-z][a-z0-9_]{0,40}$/;

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AllowedKey = (typeof ALLOWED_PROP_KEYS)[number];

export type AnalyticsSender = (
  name: string,
  props?: Record<string, string>,
) => void | Promise<unknown>;

function cleanToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!SAFE_TOKEN.test(trimmed)) return null;
  if (USER_ID.test(trimmed)) return null;
  return trimmed;
}

/** Drops anything that is not a short, allowlisted value. */
export function sanitizeProps(props: unknown): Partial<Record<AllowedKey, string>> {
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  const source = props as Record<string, unknown>;
  const safe: Partial<Record<AllowedKey, string>> = {};
  for (const key of ALLOWED_PROP_KEYS) {
    let value: unknown;
    try {
      value = source[key];
    } catch {
      continue;
    }
    if (key === "button") {
      if (typeof value === "string" && BUTTONS.has(value.trim())) safe.button = value.trim();
      continue;
    }
    if (key === "method") {
      if (typeof value === "string" && SHARE_METHODS.has(value.trim())) safe.method = value.trim();
      continue;
    }
    if (key === "source") {
      if (typeof value === "string" && SOURCES.has(value.trim())) safe.source = value.trim();
      continue;
    }
    const token = cleanToken(value);
    if (token) safe[key] = token;
  }
  return safe;
}

export function trackEvent(name: string, props?: unknown, send?: AnalyticsSender): void {
  try {
    if (typeof name !== "string" || !EVENT_NAME.test(name)) return;
    const safe = sanitizeProps(props);
    const emit = send ?? track;
    const result = Object.keys(safe).length > 0 ? emit(name, safe) : emit(name);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      void Promise.resolve(result).catch(() => undefined);
    }
  } catch {
    // Analytics must never break the page.
  }
}

const CAMPAIGN_PARAMS = new Set(["utm_source", "utm_medium", "utm_campaign"]);

/** Shared links carry ref=share. Any other ref value is dropped. */
const REF_VALUES = new Set(["share"]);

/**
 * Page routes. A fully static path outranks a dynamic segment, so /cards/new
 * stays /cards/new instead of /cards/[id].
 */
export const PAGE_PATTERNS = [
  "/",
  "/about",
  "/achievements",
  "/admin/comp-flags",
  "/admin/reports",
  "/cards/[id]",
  "/cards/[id]/edit",
  "/cards/[id]/posts",
  "/cards/new",
  "/collection",
  "/compose",
  "/forgot-password",
  "/home",
  "/leaderboard",
  "/login",
  "/messages",
  "/messages/[username]",
  "/more",
  "/moving-today",
  "/notifications",
  "/portfolio",
  "/posts/[id]",
  "/privacy",
  "/profile",
  "/profile/followers",
  "/profile/following",
  "/reset-password",
  "/scan",
  "/search",
  "/settings/collecting",
  "/settings/privacy",
  "/signup",
  "/terms",
  "/u/[username]",
  "/u/[username]/badges",
  "/u/[username]/badges/[category]/[tier]",
  "/u/[username]/cards/[id]",
  "/u/[username]/followers",
  "/u/[username]/following",
] as const;

function normalizePath(pathname: string): string {
  if (!pathname.startsWith("/")) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function routePattern(pathname: string): string {
  const path = normalizePath(pathname);
  const parts = path === "/" ? [] : path.slice(1).split("/");
  let best: { pattern: string; score: number } | null = null;
  for (const pattern of PAGE_PATTERNS) {
    const expected = pattern === "/" ? [] : pattern.slice(1).split("/");
    if (expected.length !== parts.length) continue;
    let score = 0;
    let matches = true;
    for (let index = 0; index < expected.length; index += 1) {
      const segment = expected[index];
      const dynamic = segment.startsWith("[") && segment.endsWith("]") && segment.length > 2;
      if (dynamic) {
        if (!parts[index]) {
          matches = false;
          break;
        }
        continue;
      }
      if (segment.toLowerCase() !== parts[index].toLowerCase()) {
        matches = false;
        break;
      }
      score += 1;
    }
    if (matches && (!best || score > best.score)) best = { pattern, score };
  }
  return best?.pattern ?? "/[unknown]";
}

function campaignQuery(params: URLSearchParams): string {
  const kept = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === "ref" && !kept.has(key) && REF_VALUES.has(value)) {
      kept.append(key, value);
      continue;
    }
    if (!CAMPAIGN_PARAMS.has(key) || kept.has(key)) continue;
    const token = cleanToken(value);
    if (!token) continue;
    kept.append(key, token);
  }
  const query = kept.toString();
  return query ? `?${query}` : "";
}

function scrubbedUrl(input: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(input, "https://slabhold.local");
  } catch {
    return null;
  }
  const relative = `${routePattern(parsed.pathname)}${campaignQuery(parsed.searchParams)}`;
  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(input)) return `${parsed.origin}${relative}`;
  return relative;
}

/**
 * beforeSend: page views keep the route pattern plus utm_source, utm_medium,
 * and utm_campaign. Usernames, ids, search text, and other query params are dropped.
 */
export function scrubAnalyticsUrl(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    if (!event || typeof event.url !== "string") return null;
    const url = scrubbedUrl(event.url);
    if (url == null) return null;
    return { ...event, url };
  } catch {
    return null;
  }
}
