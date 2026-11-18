/**
 * Bigger text. Every text size in the app is in rem, so the page follows the
 * root font size: the browser's own setting on desktop and Android with no
 * code at all. An iPhone or iPad keeps its text size in Settings (Dynamic
 * Type), and a web view only sees it through the `-apple-system-body` font.
 * A tiny script in <head> measures that font and sizes the root to match,
 * before the first paint, and again when the app comes back to the front.
 */

/** `-apple-system-body` at the default iPhone text size. */
const APPLE_BODY_PX = 17;
const MIN = 0.8;
/** Every main screen is checked at 200%, so the scale stops there. */
const MAX = 2;

/** The root font size, in percent, for a measured body size. Null: leave it alone. */
export function textScalePercent(bodyPx: number): number | null {
  if (!Number.isFinite(bodyPx) || bodyPx <= 0) return null;
  const scale = Math.min(MAX, Math.max(MIN, bodyPx / APPLE_BODY_PX));
  if (Math.abs(scale - 1) < 0.01) return null;
  return Math.round(scale * 10000) / 100;
}

/**
 * Under this many rem across, the screen is in big-text mode: `<html data-big-text>`.
 * 20rem is a 320px phone at the default size, the narrowest screen the layouts are
 * drawn for. Past that, rows stack and names wrap (the `big:` variant in globals.css).
 */
export const BIG_TEXT_BELOW_REM = 20;

export function isBigText(viewportPx: number, rootPx: number): boolean {
  return rootPx > 0 && viewportPx > 0 && viewportPx / rootPx < BIG_TEXT_BELOW_REM;
}

export const TEXT_SCALE_SCRIPT = `try{(function(){var d=document,r=d.documentElement,n=navigator,u=n.userAgent||"",w=window;var apple=(/iPhone|iPad|iPod/.test(u)||(/Macintosh/.test(u)&&n.maxTouchPoints>1))&&!!(w.CSS&&CSS.supports&&CSS.supports("font","-apple-system-body"));function pct(b){if(!(b>0)||!isFinite(b))return null;var s=Math.min(${MAX},Math.max(${MIN},b/${APPLE_BODY_PX}));return Math.abs(s-1)<0.01?null:Math.round(s*10000)/100}function size(){try{if(apple){var p=d.createElement("span");p.style.cssText="font:-apple-system-body;position:absolute;visibility:hidden";(d.body||r).appendChild(p);var v=pct(parseFloat(getComputedStyle(p).fontSize));p.remove();r.style.fontSize=v?v+"%":""}var px=parseFloat(getComputedStyle(r).fontSize),vw=w.innerWidth||r.clientWidth;if(px>0&&vw>0&&vw/px<${BIG_TEXT_BELOW_REM})r.setAttribute("data-big-text","");else r.removeAttribute("data-big-text")}catch(e){}}size();d.addEventListener("visibilitychange",function(){if(!d.hidden)size()});w.addEventListener("pageshow",size);w.addEventListener("resize",size)})()}catch(e){}`;
