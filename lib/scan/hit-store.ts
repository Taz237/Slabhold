import { NO_STREAK, streakAfterScan, streakWithLateHit, type HitStreak } from "./hit";

/**
 * What hit reveals remember on this phone. The setting and "has this collector had a first hit"
 * live in localStorage; the streak lives in sessionStorage, so it is this session's only. Storage
 * that is blocked or full never breaks a scan: every read has a default and every write may fail.
 */

const SETTING_KEY = "slabhold:hit-reveals";
const FIRST_KEY = "slabhold:first-hit";
const STREAK_KEY = "slabhold:hit-streak";

function read(storage: "localStorage" | "sessionStorage", key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window[storage].getItem(key);
  } catch {
    return null;
  }
}

function write(storage: "localStorage" | "sessionStorage", key: string, value: string): void {
  try {
    window[storage].setItem(key, value);
  } catch {
    // Private mode or a full disk: the setting just doesn't stick.
  }
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/** For useSyncExternalStore: the setting and the streak. */
export function subscribeHits(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** "Hit reveals" in settings. On unless the collector turned it off. */
export function hitRevealsOn(): boolean {
  return read("localStorage", SETTING_KEY) !== "off";
}

export function setHitReveals(on: boolean): void {
  write("localStorage", SETTING_KEY, on ? "on" : "off");
  changed();
}

/** True until this collector's first hit has played on this phone. */
export function firstHitPending(): boolean {
  return read("localStorage", FIRST_KEY) == null;
}

export function markFirstHit(): void {
  write("localStorage", FIRST_KEY, "1");
}

/** The scan preview only (/scan/preview?state=hit-first): the next hit plays as the first again. */
export function resetFirstHit(): void {
  try {
    window.localStorage.removeItem(FIRST_KEY);
  } catch {
    // Nothing to forget.
  }
}

let streak: HitStreak | null = null;

function parseStreak(raw: string | null): HitStreak {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<HitStreak>) : null;
    const whole = (count: unknown) => (typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : 0);
    return value ? { count: whole(value.count), before: whole(value.before) } : NO_STREAK;
  } catch {
    return NO_STREAK;
  }
}

export function hitStreak(): HitStreak {
  streak ??= parseStreak(read("sessionStorage", STREAK_KEY));
  return streak;
}

function store(next: HitStreak): void {
  streak = next;
  write("sessionStorage", STREAK_KEY, JSON.stringify(next));
  changed();
}

/** One scan landed: a hit adds to the streak, anything else ends it. */
export function recordScan(isHit: boolean): void {
  store(streakAfterScan(hitStreak(), isHit));
}

/** The last scan's sale came in late and made it a hit. */
export function recordLateHit(): void {
  store(streakWithLateHit(hitStreak()));
}

/** Can this browser draw the effect at all. Asked before the renderer is loaded. */
export function webglAvailable(): boolean {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

/** Can this browser record the share clip (a canvas into a video file). */
export function clipSupported(): boolean {
  try {
    return (
      typeof MediaRecorder !== "undefined" &&
      typeof HTMLCanvasElement.prototype.captureStream === "function" &&
      ["video/mp4", "video/webm"].some((type) => MediaRecorder.isTypeSupported(type))
    );
  } catch {
    return false;
  }
}
