"use client";

import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { useReducedMotion } from "@/components/timeline-ui";
import { gifLabel, type PostGif } from "@/lib/social/gifs";

/**
 * A GIF as a muted, looping, inline video over its still. It plays only while
 * it is on screen. Under Reduce Motion nothing moves until `play` is true.
 * The box is sized from the GIF's own width and height, so nothing shifts.
 */
export function GifMedia({
  gif,
  play,
  className = "",
  onFailed,
}: {
  gif: PostGif;
  /** False: the still only. */
  play: boolean;
  className?: string;
  onFailed?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [stillFailed, setStillFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !play) return;
    // Autoplay can be refused (Low Power Mode). The still stays, and a tap plays it.
    const start = () => {
      const started = video.play() as Promise<void> | undefined;
      started?.catch(() => {});
    };
    if (typeof IntersectionObserver === "undefined") {
      start();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) start();
          else video.pause();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [play]);

  const frame = `block h-full w-full object-cover ${className}`;
  if (play && !failed) {
    return (
      <video
        ref={videoRef}
        data-gif-video=""
        src={gif.mp4}
        poster={gif.still}
        muted
        loop
        playsInline
        preload="metadata"
        disablePictureInPicture
        aria-hidden="true"
        onError={() => {
          setFailed(true);
          onFailed?.();
        }}
        className={frame}
      />
    );
  }
  if (stillFailed) return <span data-gif-placeholder="" className={`block h-full w-full bg-zinc-200 dark:bg-white/10 ${className}`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-gif-still=""
      src={gif.still}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setStillFailed(true)}
      className={frame}
    />
  );
}

const GIF_FRAME =
  "relative block overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-violet-500/15 dark:bg-white/[0.04] dark:ring-violet-400/20";

/** Sized from the GIF itself. A very tall one is cropped to a square-ish frame, never stretched. */
function gifBox(gif: PostGif, maxWidth: number): React.CSSProperties {
  const tall = gif.height > gif.width * 1.25;
  return { aspectRatio: tall ? "4 / 5" : `${gif.width} / ${gif.height}`, maxWidth };
}

/**
 * The GIF on a post or reply. It autoplays muted. A tap pauses it and a
 * second tap plays it again. Under Reduce Motion it starts as a still with a
 * play button.
 */
export function PostGifPlayer({
  gif,
  size = "post",
}: {
  gif: PostGif;
  /** "post": up to the column width. "reply": a smaller frame. */
  size?: "post" | "reply";
}) {
  const reduceMotion = useReducedMotion();
  /** null: follow the Reduce Motion setting. */
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [broken, setBroken] = useState(false);
  const playing = !broken && (chosen ?? !reduceMotion);
  const label = gifLabel(gif);

  return (
    <button
      type="button"
      data-post-gif=""
      data-playing={playing ? "true" : "false"}
      aria-label={playing ? `Pause ${label}` : `Play ${label}`}
      aria-pressed={playing}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setBroken(false);
        setChosen(!playing);
      }}
      style={gifBox(gif, size === "reply" ? 240 : 448)}
      className={`mt-3 w-full ${GIF_FRAME}`}
    >
      <GifMedia gif={gif} play={playing} onFailed={() => setBroken(true)} />
      {playing ? null : (
        <span className="absolute inset-0 grid place-items-center bg-black/20">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/70 text-white">
            <Play className="h-5 w-5 translate-x-px fill-current" aria-hidden="true" />
          </span>
        </span>
      )}
      <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-11 font-medium text-white">
        GIF
      </span>
      <span className="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 text-11 text-white/90">
        via GIPHY
      </span>
    </button>
  );
}

/** The GIF picked in a composer, with a 44px remove button. */
export function GifDraft({
  gif,
  onRemove,
  size = "post",
}: {
  gif: PostGif;
  onRemove: () => void;
  size?: "post" | "reply";
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div
      data-gif-draft=""
      style={gifBox(gif, size === "reply" ? 128 : 320)}
      className={`${size === "reply" ? "mb-1" : "mt-3"} w-full ${GIF_FRAME}`}
    >
      <GifMedia gif={gif} play={!reduceMotion} />
      <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-11 font-medium text-white">
        GIF
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove GIF"
        className="group absolute top-0 right-0 grid h-11 w-11 place-items-center rounded-full text-white"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/70 group-active:bg-black/80">
          <X className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}
