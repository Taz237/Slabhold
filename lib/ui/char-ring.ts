/** How close a post is to the limit, for the composer's character ring. */
export type CharRing = {
  /** Hidden until the first character, like X. */
  visible: boolean;
  /** 0 to 1, how much of the ring is filled. */
  progress: number;
  remaining: number;
  /** normal: purple. warn: amber, the last 20. over: rose, nothing left. */
  tone: "normal" | "warn" | "over";
  /** The countdown drawn inside the ring once it turns amber. */
  label: string | null;
};

export const CHAR_RING_WARN_AT = 20;

export function charRing(length: number, limit: number): CharRing {
  const remaining = limit - length;
  const tone = remaining <= 0 ? "over" : remaining <= CHAR_RING_WARN_AT ? "warn" : "normal";
  return {
    visible: length > 0,
    progress: limit > 0 ? Math.min(1, Math.max(0, length / limit)) : 0,
    remaining,
    tone,
    label: tone === "normal" ? null : String(remaining),
  };
}
