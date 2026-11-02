import type { ReactNode } from "react";

/**
 * React preloads every eager <img> it renders from the <head>, in render
 * order, ahead of the photo that matters. An <img> inside <picture> it leaves
 * alone: the browser still loads it eagerly, at its own priority, as soon as
 * it reads it in the body. `contents` gives the <picture> no box, so the
 * layout is the same as a bare <img>.
 */
export function NoHeadPreload({ children }: { children: ReactNode }) {
  return <picture className="contents">{children}</picture>;
}
