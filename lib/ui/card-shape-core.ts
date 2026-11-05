/**
 * Card photos are stored at their own ratio, with no size saved. Portrait is
 * the default, so an unknown photo never moves. Pure, so server code (share
 * images) can use it without React.
 */
export type CardShape = "portrait" | "landscape";

/** Landscape only when clearly wider than tall, so a near-square crop stays portrait. */
export function cardShape(width: number, height: number): CardShape {
  if (!(width > 0) || !(height > 0)) return "portrait";
  return width > height * 1.1 ? "landscape" : "portrait";
}
