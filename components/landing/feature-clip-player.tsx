"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaSlot } from "@/lib/landing/media";

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * The clip itself, loaded by FeatureClip (feature-clip.tsx) only when a clip
 * is drawn. A real recording of the app inside a glass phone. Nothing
 * downloads until it is on screen (preload="none", the poster paints first);
 * it plays only in view and stops out of view. The 44px button pauses and
 * plays it. With reduced motion it never starts by itself: the poster and a
 * play button.
 */
export default function FeatureClipPlayer({ slot, label }: { slot: MediaSlot; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  /** The reader's own choice. Null until they press the button. */
  const wanted = useRef<boolean | null>(null);
  const [playing, setPlaying] = useState(false);

  function start(node: HTMLVideoElement) {
    Promise.resolve(node.play()).then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }

  function stop(node: HTMLVideoElement) {
    node.pause();
    setPlaying(false);
  }

  useEffect(() => {
    const node = video.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const reduced = window.matchMedia?.(REDUCED).matches === true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (!entry.isIntersecting) stop(node);
        else if (wanted.current ?? !reduced) start(node);
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function toggle() {
    const node = video.current;
    if (!node) return;
    wanted.current = !playing;
    if (playing) stop(node);
    else start(node);
  }

  return (
    <div className="lg-phone lg-glass" data-feature-clip="">
      <div className="lg-phone-screen">
        <video
          ref={video}
          src={slot.src}
          poster={slot.poster ?? undefined}
          width={slot.width}
          height={slot.height}
          muted
          playsInline
          loop
          preload="none"
          aria-label={label}
        />
        <button
          type="button"
          className="lg-clip-toggle"
          aria-label={playing ? `Pause: ${label}` : `Play: ${label}`}
          aria-pressed={playing}
          onClick={toggle}
        >
          <svg aria-hidden viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            {playing ? <path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" /> : <path d="M4.5 2.5v11l9-5.5-9-5.5Z" />}
          </svg>
        </button>
      </div>
    </div>
  );
}
