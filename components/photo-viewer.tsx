"use client";

/**
 * The fullscreen photo viewer, like X's on iOS: grows out of the thumbnail,
 * swipes between photos, drags down to close, pinch and double-tap zoom.
 * Loaded on demand by components/image-lightbox.tsx.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { isNativeApp, loadNative } from "@/lib/ios/platform";
import { knownPhotoSize, rememberPhotoSize, type PhotoSize } from "@/lib/social/photo-sizes";
import {
  DOUBLE_TAP_ZOOM,
  MAX_ZOOM,
  OPEN_MS,
  SLIDE_GAP,
  SPRING_FALLBACK,
  clampPan,
  containRect,
  dismissProgress,
  pinchTo,
  rubberBand,
  sharedElementFrom,
  shouldDismiss,
  snapIndex,
  springEasing,
  thumbRadius,
  trackOffset,
  zoomAt,
  type Point,
  type Rect,
  type ZoomState,
} from "@/lib/ui/photo-viewer-math";

import type { ViewerState } from "@/components/image-lightbox";

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("button, [href], input, select, textarea")].filter(
    (node) => !node.hasAttribute("disabled") && node.tabIndex !== -1 && !node.closest("[inert]"),
  );
}

const IDENTITY = "translate3d(0px, 0px, 0px) scale(1)";
const NO_CLIP = "inset(0px 0px 0px 0px round 0px)";
/** Movement under this is a tap, not a drag. */
const SLOP = 8;
const DOUBLE_TAP_MS = 280;

type StyleMap = Partial<Record<"transform" | "opacity" | "clipPath", string>>;
const CSS_NAME: Record<keyof StyleMap, string> = { transform: "transform", opacity: "opacity", clipPath: "clip-path" };

/** Set styles with no animation. */
function place(el: HTMLElement | null | undefined, styles: StyleMap) {
  if (!el) return;
  el.style.transition = "none";
  Object.assign(el.style, styles);
}

/** Animate transform, opacity or clip-path only, so it stays on the compositor. */
function tween(el: HTMLElement | null | undefined, styles: StyleMap, ms: number, easing: string): Promise<void> {
  return new Promise((resolve) => {
    if (!el) {
      resolve();
      return;
    }
    const keys = Object.keys(styles) as (keyof StyleMap)[];
    el.style.transition = keys.map((key) => `${CSS_NAME[key]} ${ms}ms ${easing}`).join(", ");
    Object.assign(el.style, styles);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("transitionend", onEnd);
      window.clearTimeout(timer);
      resolve();
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === el) finish();
    };
    el.addEventListener("transitionend", onEnd);
    const timer = window.setTimeout(finish, ms + 60);
  });
}

/** The current x of a transform, mid-animation included. */
function currentX(el: HTMLElement | null): number | null {
  if (!el || typeof DOMMatrixReadOnly === "undefined") return null;
  try {
    const value = getComputedStyle(el).transform;
    if (!value || value === "none") return 0;
    return new DOMMatrixReadOnly(value).m41;
  } catch {
    return null;
  }
}

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function springCurve() {
  try {
    if (typeof CSS !== "undefined" && CSS.supports("transition-timing-function", "linear(0, 1)")) return springEasing();
  } catch {
    // Old engine: the bezier below.
  }
  return SPRING_FALLBACK;
}

function naturalOf(img: HTMLImageElement | null | undefined): PhotoSize | null {
  if (!img || !(img.naturalWidth > 0) || !(img.naturalHeight > 0)) return null;
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/** The thumbnail to grow from or shrink into, if it's on screen. */
function originFor(img: HTMLImageElement | null | undefined, screen: PhotoSize) {
  if (!img || !img.isConnected) return null;
  const box = img.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return null;
  if (box.bottom <= 0 || box.top >= screen.height || box.right <= 0 || box.left >= screen.width) return null;
  const fit = getComputedStyle(img).objectFit === "contain" ? ("contain" as const) : ("cover" as const);
  const radius = thumbRadius(img.dataset.photoRadius, box.width, box.height);
  const rect: Rect = { left: box.left, top: box.top, width: box.width, height: box.height };
  return { rect, fit, radius };
}

function setOriginHidden(img: HTMLImageElement | null | undefined, hidden: boolean) {
  if (!img) return;
  img.style.visibility = hidden ? "hidden" : "";
}

type Gesture =
  | { kind: "none" }
  | {
      kind: "pending" | "swipe" | "dismiss" | "pan";
      id: number;
      start: Point;
      startTime: number;
      trackStart: number;
      pan: ZoomState;
      samples: { x: number; y: number; t: number }[];
      last: Point;
      /** False for the finger left down after a pinch: lifting it is not a tap. */
      tappable: boolean;
    }
  | { kind: "pinch"; start: { pan: ZoomState; mid: Point; distance: number } };

export default function PhotoViewer({ viewer, onClosed }: { viewer: ViewerState; onClosed: () => void }) {
  const { images, alt, origins, footer } = viewer;
  const count = images.length;
  const [index, setIndex] = useState(viewer.index);
  const [chromeOn, setChromeOn] = useState(true);
  const [screen, setScreen] = useState<PhotoSize>(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => near(viewer.index, count));
  const [sizes, setSizes] = useState<(PhotoSize | null)[]>(() =>
    images.map((src, i) => naturalOf(origins[i]) ?? knownPhotoSize(src)),
  );

  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dragRefs = useRef<(HTMLDivElement | null)[]>([]);
  const zoomRefs = useRef<(HTMLDivElement | null)[]>([]);

  const live = useRef({ index: viewer.index, screen, sizes, closing: false, released: false });
  live.current.index = index;
  live.current.screen = screen;
  live.current.sizes = sizes;

  const zoom = useRef<ZoomState>({ x: 0, y: 0, scale: 1 });
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>({ kind: "none" });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const tapTimer = useRef(0);
  const easing = useRef("");

  const stride = screen.width + SLIDE_GAP;

  /** Fullscreen: the header and tab bar fade out, and in the app the status bar hides. */
  const releaseChrome = useCallback(() => {
    if (live.current.released) return;
    live.current.released = true;
    document.documentElement.removeAttribute("data-photo-viewer");
    if (isNativeApp()) {
      void loadNative()
        .then((native) => native.setStatusBarHidden(false))
        .catch(() => {});
    }
  }, []);

  const go = useCallback(
    (next: number, animate: boolean) => {
      const { screen: size } = live.current;
      const target = -next * (size.width + SLIDE_GAP);
      if (animate) void tween(trackRef.current, { transform: `translate3d(${target}px, 0px, 0px)` }, 380, easing.current);
      else place(trackRef.current, { transform: `translate3d(${target}px, 0px, 0px)` });
      const previous = live.current.index;
      if (next === previous) return;
      // The photo left behind goes back to 1x.
      place(zoomRefs.current[previous], { transform: IDENTITY });
      zoom.current = { x: 0, y: 0, scale: 1 };
      setOriginHidden(origins[previous], false);
      setOriginHidden(origins[next], true);
      live.current.index = next;
      setIndex(next);
      setSeen((current) => {
        const more = new Set(current);
        for (const i of near(next, count)) more.add(i);
        return more;
      });
    },
    [count, origins],
  );

  const close = useCallback(() => {
    if (live.current.closing) return;
    live.current.closing = true;
    window.clearTimeout(tapTimer.current);
    releaseChrome();
    const at = live.current.index;
    const size = live.current.sizes[at];
    const screenNow = live.current.screen;
    const drag = dragRefs.current[at];
    const zoomLayer = zoomRefs.current[at];
    const origin = originFor(origins[at], screenNow);
    const reduce = reducedMotion();
    void tween(chromeRef.current, { opacity: "0" }, 120, "ease-out");
    let done: Promise<unknown>;
    if (!reduce && origin && size) {
      const to = sharedElementFrom(origin, containRect(size, { left: 0, top: 0, ...screenNow }));
      done = Promise.all([
        tween(drag, { transform: to.transform, opacity: "1" }, OPEN_MS, easing.current),
        tween(zoomLayer, { transform: IDENTITY, clipPath: to.clip }, OPEN_MS, easing.current),
        tween(backdropRef.current, { opacity: "0" }, OPEN_MS, "ease-out"),
      ]);
    } else {
      // Nowhere to shrink into: fade, carrying on in the direction it was dragged.
      const ms = reduce ? 120 : 200;
      const pushed = drag?.style.transform && drag.style.transform !== IDENTITY ? drag.style.transform : IDENTITY;
      done = Promise.all([
        tween(drag, { opacity: "0", transform: reduce ? pushed : `${pushed} scale(0.94)` }, ms, "ease-out"),
        tween(backdropRef.current, { opacity: "0" }, ms, "ease-out"),
      ]);
    }
    void done.then(() => {
      setOriginHidden(origins[at], false);
      onClosed();
    });
  }, [onClosed, origins, releaseChrome]);

  // Open: grow out of the thumbnail.
  useLayoutEffect(() => {
    easing.current = springCurve();
    const at = live.current.index;
    const size = live.current.sizes[at];
    const screenNow = live.current.screen;
    place(trackRef.current, { transform: `translate3d(${-at * (screenNow.width + SLIDE_GAP)}px, 0px, 0px)` });
    const drag = dragRefs.current[at];
    const zoomLayer = zoomRefs.current[at];
    const origin = originFor(origins[at], screenNow);
    const reduce = reducedMotion();
    // Set again here: React's dev double-run releases once before the real open.
    live.current.released = false;
    document.documentElement.setAttribute("data-photo-viewer", "");
    if (isNativeApp()) {
      void loadNative()
        .then((native) => native.setStatusBarHidden(true))
        .catch(() => {});
    }
    if (!reduce && origin && size) {
      const from = sharedElementFrom(origin, containRect(size, { left: 0, top: 0, ...screenNow }));
      place(drag, { transform: from.transform });
      place(zoomLayer, { clipPath: from.clip });
      place(backdropRef.current, { opacity: "0" });
      place(chromeRef.current, { opacity: "0" });
      setOriginHidden(origins[at], true);
      void drag?.offsetWidth; // commit the start frame before animating
      void tween(drag, { transform: IDENTITY }, OPEN_MS, easing.current);
      void tween(zoomLayer, { clipPath: NO_CLIP }, OPEN_MS, easing.current);
      void tween(backdropRef.current, { opacity: "1" }, OPEN_MS * 0.8, "ease-out");
      void tween(chromeRef.current, { opacity: "1" }, OPEN_MS, "ease-out");
    } else {
      setOriginHidden(origins[at], Boolean(origin));
      place(drag, { opacity: "0", transform: reduce ? IDENTITY : "translate3d(0px, 0px, 0px) scale(0.96)" });
      place(backdropRef.current, { opacity: "0" });
      void drag?.offsetWidth;
      const ms = reduce ? 120 : 200;
      void tween(drag, { opacity: "1", transform: IDENTITY }, ms, "ease-out");
      void tween(backdropRef.current, { opacity: "1" }, ms, "ease-out");
    }
    return () => {
      for (const img of origins) setOriginHidden(img, false);
    };
    // Mount only: the open runs once per viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard, focus trap and scroll lock.
  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const at = live.current.index;
        if (event.key === "ArrowLeft" && at > 0) go(at - 1, true);
        if (event.key === "ArrowRight" && at < count - 1) go(at + 1, true);
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = focusableIn(root);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && root.contains(active);
      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    function onFocusIn(event: FocusEvent) {
      const root = dialogRef.current;
      if (live.current.closing || !root || root.contains(event.target as Node)) return;
      closeButtonRef.current?.focus({ preventScroll: true });
    }
    function onResize() {
      const next = { width: window.innerWidth, height: window.innerHeight };
      live.current.screen = next;
      setScreen(next);
      place(trackRef.current, {
        transform: `translate3d(${-live.current.index * (next.width + SLIDE_GAP)}px, 0px, 0px)`,
      });
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("focusin", onFocusIn);
      window.clearTimeout(tapTimer.current);
      releaseChrome();
    };
  }, [close, count, go, releaseChrome]);

  // ---- Gestures. Every frame writes transform or opacity straight to the DOM; React only hears about the result.

  function fittedSize(at: number): PhotoSize {
    const size = live.current.sizes[at];
    const box = { left: 0, top: 0, ...live.current.screen };
    return size ? containRect(size, box) : live.current.screen;
  }

  function fromCenter(point: Point): Point {
    return { x: point.x - live.current.screen.width / 2, y: point.y - live.current.screen.height / 2 };
  }

  function applyZoom(state: ZoomState, ms = 0) {
    zoom.current = state;
    const layer = zoomRefs.current[live.current.index];
    const transform = `translate3d(${state.x}px, ${state.y}px, 0px) scale(${state.scale})`;
    if (ms > 0) void tween(layer, { transform }, ms, easing.current);
    else place(layer, { transform });
  }

  /** After a pinch or pan: back inside the edges and between 1x and the max. */
  function settleZoom(around: Point | null) {
    let state = zoom.current;
    if (state.scale <= 1.01) state = { x: 0, y: 0, scale: 1 };
    else if (state.scale > MAX_ZOOM) state = zoomAt(around ?? { x: 0, y: 0 }, state, MAX_ZOOM);
    const pan = clampPan(state, fittedSize(live.current.index), live.current.screen);
    applyZoom({ ...state, ...pan }, 320);
  }

  function onPhoto(point: Point): boolean {
    const size = fittedSize(live.current.index);
    const { x, y } = fromCenter(point);
    return Math.abs(x) <= size.width / 2 && Math.abs(y) <= size.height / 2;
  }

  function velocity(samples: { x: number; y: number; t: number }[], now: number) {
    const recent = samples.filter((sample) => now - sample.t <= 100);
    if (recent.length < 2) return { vx: 0, vy: 0 };
    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = Math.max(1, last.t - first.t);
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
  }

  function pinchStart(): { mid: Point; distance: number } {
    const [a, b] = [...pointers.current.values()];
    return {
      mid: fromCenter({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
      distance: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }

  function beginOne(id: number, point: Point, time: number, tappable = true) {
    const track = trackRef.current;
    const x = currentX(track);
    const base = -live.current.index * (live.current.screen.width + SLIDE_GAP);
    // Caught mid-snap: hold the carousel where it is.
    if (x !== null && Math.abs(x - base) > 0.5) place(track, { transform: `translate3d(${x}px, 0px, 0px)` });
    gesture.current = {
      kind: "pending",
      id,
      start: point,
      startTime: time,
      trackStart: x !== null ? x - base : 0,
      pan: { ...zoom.current },
      samples: [{ ...point, t: time }],
      last: point,
      tappable,
    };
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (live.current.closing) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Not supported: moves still arrive while the finger is over the photo.
    }
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 2) {
      window.clearTimeout(tapTimer.current);
      lastTap.current = null;
      const current = gesture.current;
      // A second finger turns a swipe or a drag into a pinch: put those back first.
      if (current.kind === "swipe") go(live.current.index, true);
      if (current.kind === "dismiss") springBack();
      gesture.current = { kind: "pinch", start: { pan: { ...zoom.current }, ...pinchStart() } };
      return;
    }
    if (pointers.current.size === 1) beginOne(event.pointerId, point, event.timeStamp);
  }

  function springBack() {
    const at = live.current.index;
    void tween(dragRefs.current[at], { transform: IDENTITY }, 360, easing.current);
    void tween(backdropRef.current, { opacity: "1" }, 240, "ease-out");
    void tween(chromeRef.current, { opacity: "1" }, 240, "ease-out");
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || live.current.closing) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    const current = gesture.current;
    if (current.kind === "pinch") {
      if (pointers.current.size < 2) return;
      applyZoom(pinchTo(current.start, pinchStart()));
      return;
    }
    if (current.kind === "none" || current.id !== event.pointerId) return;
    current.last = point;
    current.samples.push({ ...point, t: event.timeStamp });
    if (current.samples.length > 12) current.samples.shift();
    const dx = point.x - current.start.x;
    const dy = point.y - current.start.y;
    const { width, height } = live.current.screen;
    const at = live.current.index;

    if (current.kind === "pending") {
      if (Math.hypot(dx, dy) < SLOP) return;
      window.clearTimeout(tapTimer.current);
      if (zoom.current.scale > 1.01) current.kind = "pan";
      else if (Math.abs(dx) > Math.abs(dy)) current.kind = "swipe";
      else current.kind = "dismiss";
    }

    if (current.kind === "swipe") {
      const offset = trackOffset(current.trackStart + dx, at, count, width);
      place(trackRef.current, { transform: `translate3d(${-at * (width + SLIDE_GAP) + offset}px, 0px, 0px)` });
    } else if (current.kind === "dismiss") {
      const progress = dismissProgress(dy, height);
      place(dragRefs.current[at], {
        transform: `translate3d(${dx}px, ${dy}px, 0px) scale(${1 - progress * 0.25})`,
      });
      place(backdropRef.current, { opacity: String(1 - progress) });
      place(chromeRef.current, { opacity: String(Math.max(0, 1 - progress * 4)) });
    } else if (current.kind === "pan") {
      const wanted = { ...current.pan, x: current.pan.x + dx, y: current.pan.y + dy };
      const inside = clampPan(wanted, fittedSize(at), live.current.screen);
      // Past an edge it rubber-bands instead of stopping dead.
      applyZoom({
        ...wanted,
        x: inside.x + rubberBand(wanted.x - inside.x, width),
        y: inside.y + rubberBand(wanted.y - inside.y, height),
      });
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    if (live.current.closing) return;
    const current = gesture.current;
    const cancelled = event.type === "pointercancel";

    if (current.kind === "pinch") {
      if (pointers.current.size === 1) {
        // One finger stays down: it pans from here.
        const [[id, point]] = [...pointers.current.entries()];
        settleZoom(current.start.mid);
        beginOne(id, point, event.timeStamp, false);
      } else if (pointers.current.size === 0) {
        settleZoom(current.start.mid);
        gesture.current = { kind: "none" };
      }
      return;
    }
    if (current.kind === "none" || current.id !== event.pointerId) return;
    gesture.current = { kind: "none" };
    const dx = current.last.x - current.start.x;
    const dy = current.last.y - current.start.y;
    const { vx, vy } = velocity(current.samples, event.timeStamp);
    const { width, height } = live.current.screen;
    const at = live.current.index;

    if (current.kind === "pending") {
      if (cancelled || !current.tappable) return;
      // With a mouse, a click beside the photo closes it, like X on the web.
      if (event.pointerType === "mouse" && !onPhoto(current.start)) close();
      else onTap(current.start, event.timeStamp);
    } else if (current.kind === "swipe") {
      const next = cancelled ? at : snapIndex({ index: at, count, dx: current.trackStart + dx, vx, width });
      go(next, true);
    } else if (current.kind === "dismiss") {
      if (!cancelled && shouldDismiss({ dy, vy, height })) close();
      else springBack();
    } else if (current.kind === "pan") {
      // A little glide after the finger lifts, then back inside the edges.
      const glide = { ...zoom.current, x: zoom.current.x + vx * 120, y: zoom.current.y + vy * 120 };
      const pan = clampPan(glide, fittedSize(at), live.current.screen);
      applyZoom({ ...glide, ...pan }, 380);
    }
  }

  /** One tap shows or hides the buttons; two taps zoom in on that spot, or back out. */
  function onTap(point: Point, time: number) {
    const previous = lastTap.current;
    if (previous && time - previous.t < DOUBLE_TAP_MS && Math.hypot(point.x - previous.x, point.y - previous.y) < 40) {
      window.clearTimeout(tapTimer.current);
      lastTap.current = null;
      if (zoom.current.scale > 1.01) {
        applyZoom({ x: 0, y: 0, scale: 1 }, 320);
      } else {
        const zoomed = zoomAt(fromCenter(point), zoom.current, DOUBLE_TAP_ZOOM);
        const pan = clampPan(zoomed, fittedSize(live.current.index), live.current.screen);
        applyZoom({ ...zoomed, ...pan }, 320);
      }
      return;
    }
    lastTap.current = { t: time, ...point };
    window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => {
      lastTap.current = null;
      setChromeOn((on) => !on);
    }, DOUBLE_TAP_MS);
  }

  function onLoad(at: number, img: HTMLImageElement) {
    const natural = naturalOf(img);
    if (!natural) return;
    rememberPhotoSize(images[at], natural.width, natural.height);
    if (live.current.sizes[at]) return;
    setSizes((current) => current.map((size, i) => (i === at ? natural : size)));
  }

  const box = { left: 0, top: 0, ...screen };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      data-photo-viewer-dialog=""
      className="fixed inset-0 z-[80] touch-none overscroll-contain select-none"
    >
      <div ref={backdropRef} aria-hidden="true" className="absolute inset-0 bg-black will-change-[opacity]" />
      <div
        data-photo-stage=""
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
        className="absolute inset-0 overflow-hidden"
      >
        <div ref={trackRef} className="absolute inset-0 will-change-transform">
          {images.map((src, i) => {
            const size = sizes[i];
            const fit = size ? containRect(size, box) : null;
            const placeholder = origins[i]?.currentSrc;
            return (
              <div
                key={`${i}-${src}`}
                data-photo-slide={i}
                aria-hidden={i === index ? undefined : true}
                className="absolute inset-0"
                style={{ transform: `translate3d(${i * stride}px, 0px, 0px)` }}
              >
                <div
                  ref={(node) => {
                    dragRefs.current[i] = node;
                  }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <div
                    ref={(node) => {
                      zoomRefs.current[i] = node;
                    }}
                    className="relative shrink-0"
                    style={fit ? { width: fit.width, height: fit.height } : { width: screen.width, height: screen.height }}
                  >
                    {/* The thumbnail the feed already decoded, under the full photo while it loads. */}
                    {placeholder && placeholder !== src && seen.has(i) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={placeholder}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    ) : null}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={seen.has(i) ? src : undefined}
                      alt={i === index ? alt : ""}
                      draggable={false}
                      decoding={i === index ? "sync" : "async"}
                      onLoad={(event) => onLoad(i, event.currentTarget)}
                      className="relative h-full w-full object-contain"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div ref={chromeRef} className="pointer-events-none absolute inset-0">
        <div
          data-photo-chrome={chromeOn ? "shown" : "hidden"}
          inert={!chromeOn}
          className={`absolute inset-0 transition-opacity duration-200 ease-out motion-reduce:transition-none ${
            chromeOn ? "opacity-100" : "opacity-0"
          }`}
        >
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close"
            onClick={close}
            className="pointer-events-auto absolute top-[max(0.5rem,env(safe-area-inset-top))] left-2 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white transition-transform duration-150 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent pt-10 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
            {count > 1 ? (
              <div
                role="img"
                aria-label={`Photo ${index + 1} of ${count}`}
                data-photo-dots=""
                className="flex justify-center gap-1.5 pb-2"
              >
                {images.map((src, i) => (
                  <span
                    key={`${i}-${src}`}
                    className={`h-1.5 w-1.5 rounded-full bg-white transition-opacity duration-200 ${
                      i === index ? "opacity-100" : "opacity-40"
                    }`}
                  />
                ))}
              </div>
            ) : null}
            {footer ? (
              <div className="pointer-events-auto mx-auto max-w-lg px-4">{footer(close)}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The photo and its neighbours: loaded now, so a swipe never shows an empty slide. */
function near(index: number, count: number): ReadonlySet<number> {
  return new Set([index - 1, index, index + 1].filter((i) => i >= 0 && i < count));
}
