/**
 * When the reader comes back to Home (Back from a post, a back-forward cache
 * restore, or the tab after a while away), Home quietly asks whether newer
 * posts are in. This decides when that happens: at most once per return.
 */

/** A tab hidden for less than this is a quick flip, not a return. */
export const RETURN_AWAY_MS = 30_000;
/** Signals that land this close together are the same return. */
const SAME_RETURN_MS = 10_000;

export function createReturnRecheck() {
  let hiddenAt: number | null = null;
  let lastCheck = Number.NEGATIVE_INFINITY;

  function check(now: number) {
    if (now - lastCheck < SAME_RETURN_MS) return false;
    lastCheck = now;
    return true;
  }

  return {
    /** The timeline mounted. True when it was drawn from memory, which means Back. */
    mounted(fromMemory: boolean, now: number) {
      return fromMemory ? check(now) : false;
    },
    hidden(now: number) {
      hiddenAt = now;
    },
    visible(now: number) {
      const at = hiddenAt;
      hiddenAt = null;
      return at !== null && now - at >= RETURN_AWAY_MS && check(now);
    },
    /** `pageshow`. Only a back-forward cache restore (persisted) counts. */
    pageShow(persisted: boolean, now: number) {
      if (!persisted) return false;
      hiddenAt = null;
      return check(now);
    },
  };
}
