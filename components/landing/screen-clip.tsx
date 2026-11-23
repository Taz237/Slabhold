"use client";

import { useEffect, useRef, useState } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

export type ScreenStill = { src: string; srcSet?: string; sizes?: string; width: number; height: number; alt: string };

/**
 * A short, silent recording of the app in a plain frame. The server HTML is
 * only the lazy still, so nothing about the clip is in the <head> and nothing
 * preloads. The <video> is added the first time the frame scrolls into view,
 * with the still as its poster; it plays in view and pauses out of view. With
 * reduced motion it is never added: the still is all there is.
 */
export function ScreenClip({ still, video }: { still: ScreenStill; video: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  /** Null until the frame is first on screen; then the poster to show under the first frame. */
  const [poster, setPoster] = useState<string | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = frame.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.(REDUCED).matches === true) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setInView(entry.isIntersecting);
        // The still the browser already picked, so the poster costs no second download.
        if (entry.isIntersecting) setPoster((was) => was ?? (image.current?.currentSrc || still.src));
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [still.src]);

  useEffect(() => {
    const node = player.current;
    if (!node) return;
    if (inView) Promise.resolve(node.play()).catch(() => {});
    else node.pause();
  }, [inView, poster]);

  return (
    <div ref={frame} className="lp-screen" data-landing-screen="clip">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={image} {...still} alt={still.alt} loading="lazy" decoding="async" />
      {poster ? (
        <video
          ref={player}
          src={video}
          poster={poster}
          width={still.width}
          height={still.height}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          aria-hidden
          tabIndex={-1}
        />
      ) : null}
    </div>
  );
}
