import { track } from "@vercel/analytics";

/**
 * Hobby hides custom events in the dashboard. These calls stay so an upgrade records them.
 * Only short, non-identifying values are sent.
 */
const ALLOWED_PROP_KEYS = ["button", "utm_source", "utm_medium", "utm_campaign"] as const;

const BUTTONS = new Set(["signup", "login"]);

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
