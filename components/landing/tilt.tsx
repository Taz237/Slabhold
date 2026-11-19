/** The most a tilted card leans, in degrees, unless a caller asks for another cap. */
export const TILT_MAX_DEG = 7;

/** Where the pointer is over the box, as a lean: left edge leans left, top edge leans back. */
export function tiltFor(x: number, y: number, width: number, height: number, max = TILT_MAX_DEG): { x: number; y: number } {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const round = (value: number) => Math.round(value * 100) / 100 || 0;
  return {
    x: round(-clamp((y / height) * 2 - 1) * max),
    y: round(clamp((x / width) * 2 - 1) * max),
  };
}
