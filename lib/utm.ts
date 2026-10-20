import { sanitizeProps } from "@/lib/analytics";

export const UTM_STORAGE_KEY = "slabhold.utm";

/** Seven days from the first visit that had campaign parameters. */
export const UTM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

export type UtmProps = Partial<Record<(typeof UTM_KEYS)[number], string>>;

export type UtmStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function pickUtm(props: unknown): UtmProps {
  const safe = sanitizeProps(props);
  const utm: UtmProps = {};
  for (const key of UTM_KEYS) {
    const value = safe[key];
    if (value) utm[key] = value;
  }
  return utm;
}

function utmFromSearch(search: string): UtmProps {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const raw: Record<string, unknown> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) raw[key] = value;
  }
  return pickUtm(raw);
}

/** Fresh first-touch values, or null when missing, expired, or unsafe. */
export function readFreshUtm(store: UtmStore, now = Date.now()): UtmProps | null {
  const raw = store.getItem(UTM_STORAGE_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const savedAt = (parsed as { savedAt?: unknown }).savedAt;
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  if (savedAt > now + 60_000) return null;
  if (now - savedAt > UTM_TTL_MS) return null;
  const utm = pickUtm(parsed);
  return Object.keys(utm).length > 0 ? utm : null;
}

/**
 * Saves campaign parameters from the first visit that has them.
 * A later link does not replace them until the 7 days are up.
 */
export function captureFirstTouch(search: string, store: UtmStore, now = Date.now()): UtmProps {
  try {
    const existing = readFreshUtm(store, now);
    if (existing) return existing;
    const incoming = utmFromSearch(search);
    if (Object.keys(incoming).length === 0) return {};
    store.setItem(UTM_STORAGE_KEY, JSON.stringify({ ...incoming, savedAt: now }));
    return incoming;
  } catch {
    return {};
  }
}

export function readStoredUtm(now = Date.now()): UtmProps {
  try {
    if (typeof window === "undefined") return {};
    return readFreshUtm(window.localStorage, now) ?? {};
  } catch {
    return {};
  }
}
