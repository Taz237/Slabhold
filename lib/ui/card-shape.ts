import { useCallback, useState } from "react";

import { cardShape, type CardShape } from "./card-shape-core";

/**
 * Containers read the loaded photo's natural size to tell a landscape card
 * from a portrait one. Portrait is the default, so an unknown photo never moves.
 */
export { cardShape, type CardShape };

/** Bounded, so a long scroll can't grow it forever. */
const MAX_SHAPES = 1000;
const shapes = new Map<string, CardShape>();

/** The shape of a photo already measured in this tab, so a revisit doesn't flip. */
export function knownShape(src: string | null | undefined): CardShape | undefined {
  const key = src?.trim();
  return key ? shapes.get(key) : undefined;
}

/**
 * Measure a loaded photo and remember it. A photo with no size yet isn't
 * cached, and nor is a local data: URL (it can be megabytes of key).
 */
export function rememberShape(src: string, width: number, height: number): CardShape {
  const shape = cardShape(width, height);
  const key = src.trim();
  if (!key || key.startsWith("data:") || !(width > 0) || !(height > 0)) return shape;
  shapes.delete(key);
  shapes.set(key, shape);
  // Maps keep insertion order, so the first key is the oldest.
  if (shapes.size > MAX_SHAPES) shapes.delete(shapes.keys().next().value!);
  return shape;
}

/** Measure a loaded photo by its stored URL and report its shape. */
export function measureShape(src: string, img: HTMLImageElement, onShape: (shape: CardShape) => void): void {
  if (img.naturalWidth > 0) onShape(rememberShape(src, img.naturalWidth, img.naturalHeight));
}

/** Tests only. */
export function forgetCardShapes(): void {
  shapes.clear();
}

/**
 * A photo's shape: what this tab already measured, then what its load says.
 * Portrait until known, so an unmeasured photo never moves.
 */
export function useCardShape(src: string | null | undefined): [CardShape, (shape: CardShape) => void] {
  const [measured, setMeasured] = useState<{ src: string; shape: CardShape } | null>(() => {
    const known = knownShape(src);
    return src && known ? { src, shape: known } : null;
  });
  const onShape = useCallback(
    (shape: CardShape) => {
      if (src) setMeasured((prev) => (prev?.src === src && prev.shape === shape ? prev : { src, shape }));
    },
    [src],
  );
  const shape = (measured && measured.src === src ? measured.shape : knownShape(src)) ?? "portrait";
  return [src ? shape : "portrait", onShape];
}
