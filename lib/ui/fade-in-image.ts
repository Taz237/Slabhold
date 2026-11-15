/**
 * A ref for a lazy image marked `data-fade`: it stays clear over its frame's
 * placeholder until it has loaded, then fades in (globals.css). An image that
 * is already in (cached, or loaded before the page hydrated) shows at once.
 * A failed load is shown too, so the browser's own fallback is never hidden.
 */
export function fadeInWhenLoaded(node: HTMLImageElement | null): void {
  if (!node || node.hasAttribute("data-loaded")) return;
  const done = () => node.setAttribute("data-loaded", "");
  if (node.complete) {
    done();
    return;
  }
  node.addEventListener("load", done, { once: true });
  node.addEventListener("error", done, { once: true });
}
