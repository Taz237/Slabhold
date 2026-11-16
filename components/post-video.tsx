"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Play, Volume2, VolumeX, X } from "lucide-react";
import { useImageLightbox } from "@/components/image-lightbox";
import { useReducedMotion } from "@/components/timeline-ui";
import { UnplayableTile } from "@/components/viewer-video";
import { videoDraftPercent, type VideoDraft } from "@/lib/social/video-draft";
import {
  autoplayAllowed,
  feedVideoAspect,
  feedVideoCrops,
  formatVideoTime,
  videoLabel,
  videoTimeLeft,
  type PostVideo,
} from "@/lib/social/videos";
import { videoFocus } from "@/lib/ui/video-focus";

const FRAME =
  "overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-violet-500/15 shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:bg-white/[0.04] dark:shadow-none dark:ring-violet-400/20";

const PILL = "rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-11 font-medium text-white tabular-nums";

type SaveDataConnection = { saveData?: boolean; addEventListener?: (type: "change", listener: () => void) => void; removeEventListener?: (type: "change", listener: () => void) => void };

function connection(): SaveDataConnection | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: SaveDataConnection }).connection;
}

function subscribeSaveData(onChange: () => void) {
  const link = connection();
  link?.addEventListener?.("change", onChange);
  return () => link?.removeEventListener?.("change", onChange);
}

/** True when the reader turned on Low Data / Data Saver. False on the server. */
export function useSaveData(): boolean {
  return useSyncExternalStore(
    subscribeSaveData,
    () => connection()?.saveData === true,
    () => false,
  );
}

/** The box a video takes before anything loads, from its saved width and height. */
function frameStyle(video: PostVideo, fit: "feed" | "full", size: "post" | "reply"): React.CSSProperties {
  const ratio = video.width / video.height;
  if (fit === "full") {
    // The post page: the real shape, never taller than most of the screen.
    return { aspectRatio: `${video.width} / ${video.height}`, width: `min(100%, calc(80svh * ${ratio.toFixed(4)}))` };
  }
  return { aspectRatio: feedVideoAspect(video), maxWidth: size === "reply" ? 240 : 448 };
}

/**
 * A video in a timeline or on a post page. It plays muted, looping and inline
 * while 60% of it is on screen, and only one plays at a time. A tap opens the
 * fullscreen viewer with sound. Under Reduce Motion or Low Data it waits on
 * its poster with a play button. A file this device can't play becomes a
 * clean "Can't play this video" tile.
 */
export function PostVideoPlayer({
  video,
  fit = "feed",
  size = "post",
}: {
  video: PostVideo;
  /** "feed": wide clips keep their shape, tall ones sit in 4:5. "full": the real shape. */
  fit?: "feed" | "full";
  size?: "post" | "reply";
}) {
  const id = useId();
  const openViewer = useImageLightbox();
  const reducedMotion = useReducedMotion();
  const saveData = useSaveData();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  /** Autoplay was refused (Low Power Mode): the play button shows. */
  const [refused, setRefused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [left, setLeft] = useState(() => Math.ceil(video.duration));
  const auto = autoplayAllowed({ reducedMotion, saveData }) && !failed;

  // One focus for the whole page decides which clip plays.
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.muted = true;
    element.defaultMuted = true;
    const unregister = videoFocus.register(id, {
      auto: false,
      play: () => {
        const started = element.play() as Promise<void> | undefined;
        started?.catch(() => setRefused(true));
      },
      pause: () => element.pause(),
    });
    if (typeof IntersectionObserver === "undefined") return unregister;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          videoFocus.report(id, entry.isIntersecting ? entry.intersectionRatio : 0, entry.boundingClientRect.top);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      unregister();
    };
  }, [id, failed]);

  useEffect(() => {
    videoFocus.update(id, { auto: auto && !refused });
  }, [auto, id, refused]);

  if (failed) {
    return (
      <div data-post-video="" data-video-state="unplayable" style={frameStyle(video, fit, size)} className={`mt-3 w-full ${FRAME}`}>
        <UnplayableTile poster={video.poster} />
      </div>
    );
  }

  function open(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const element = videoRef.current;
    openViewer(video.poster, videoLabel(video), undefined, {
      origins: element ? [element] : [],
      video: {
        ...video,
        startAt: element?.currentTime ?? 0,
        onClose: (time) => {
          const now = videoRef.current;
          if (!now || !Number.isFinite(time)) return;
          try {
            now.currentTime = time;
          } catch {
            // Not seekable: it carries on from where it was.
          }
        },
      },
    });
  }

  const showPlay = !playing && (!auto || refused);
  return (
    <div
      data-post-video=""
      data-video-state={playing ? "playing" : "paused"}
      style={frameStyle(video, fit, size)}
      className={`relative mt-3 w-full ${FRAME} ${fit === "full" ? "bg-black dark:bg-black" : ""}`}
    >
      <video
        ref={videoRef}
        src={video.url}
        poster={video.poster}
        muted
        loop
        playsInline
        preload="metadata"
        disablePictureInPicture
        controls={false}
        aria-hidden="true"
        tabIndex={-1}
        data-photo-radius={16}
        onPlay={() => {
          setPlaying(true);
          setRefused(false);
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => {
          const next = videoTimeLeft(video.duration, event.currentTarget.currentTime);
          setLeft((current) => (current === next ? current : next));
        }}
        onError={() => setFailed(true)}
        className={`block h-full w-full ${fit === "feed" && feedVideoCrops(video) ? "object-cover" : "object-contain"}`}
      />
      <button
        type="button"
        onClick={open}
        aria-label={`Play ${videoLabel(video)}, full screen`}
        className="absolute inset-0 grid cursor-pointer place-items-center"
      >
        {showPlay ? (
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/70 text-white">
            <Play className="h-5 w-5 translate-x-px fill-current" aria-hidden="true" />
          </span>
        ) : null}
      </button>
      <span aria-hidden="true" className={`pointer-events-none absolute bottom-2 left-2 ${PILL}`}>
        {formatVideoTime(left)}
      </span>
      {showPlay ? null : (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const element = videoRef.current;
            if (!element) return;
            element.muted = !element.muted;
            setMuted(element.muted);
          }}
          aria-label={muted ? "Turn sound on" : "Mute"}
          aria-pressed={!muted}
          className="group absolute right-0 bottom-0 grid h-11 w-11 place-items-center"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white group-active:bg-black/80">
            {muted ? <VolumeX className="h-3.5 w-3.5" aria-hidden="true" /> : <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />}
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * The picked video in a composer: its poster frame, the length, an upload
 * bar while it goes up, and a 44px X that cancels or removes it.
 */
export function VideoDraftTile({
  draft,
  onRemove,
  size = "post",
}: {
  draft: VideoDraft;
  /** Left out: no X (editing a post keeps its video). */
  onRemove?: () => void;
  size?: "post" | "reply";
}) {
  const preview = draft.preview;
  const reply = size === "reply";
  if (draft.phase === "empty") return null;
  const percent = videoDraftPercent(draft);
  const uploading = draft.phase === "uploading";
  const style: React.CSSProperties = preview
    ? { aspectRatio: feedVideoAspect(preview), maxWidth: reply ? 128 : 320 }
    : { aspectRatio: "16 / 9", maxWidth: reply ? 128 : 320 };
  return (
    <div
      data-video-draft=""
      data-phase={draft.phase}
      style={style}
      className={`relative ${reply ? "mb-1" : "mt-3"} w-full ${FRAME}`}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.poster} alt="" className="block h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true" className="skeleton-shimmer block h-full w-full" />
      )}
      {preview ? (
        // Up top while the upload bar runs along the bottom.
        <span className={`absolute left-2 ${uploading ? "top-2" : "bottom-2"} ${PILL}`}>
          {formatVideoTime(preview.duration)}
        </span>
      ) : null}
      {draft.phase === "reading" ? (
        <span className="absolute inset-x-0 bottom-2 text-center text-12 font-medium text-zinc-600 dark:text-zinc-300">
          Reading video…
        </span>
      ) : null}
      {uploading ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pt-6 pb-2">
          <div className="mb-1 flex justify-end">
            <span className={PILL}>{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Uploading video"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1 overflow-hidden rounded-full bg-white/30"
          >
            <div
              className="h-full origin-left rounded-full bg-white transition-transform duration-200 ease-out motion-reduce:transition-none"
              style={{ transform: `scaleX(${percent / 100})` }}
            />
          </div>
        </div>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={uploading || draft.phase === "reading" ? "Cancel video upload" : "Remove video"}
          className="group absolute top-0 right-0 grid h-11 w-11 place-items-center rounded-full text-white"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-black/70 group-active:bg-black/80">
            <X className="h-4 w-4" aria-hidden="true" />
          </span>
        </button>
      ) : null}
    </div>
  );
}

/** A small play mark over a poster thumbnail (quotes, shared posts in DMs). */
export function VideoThumbMark({ duration }: { duration?: number }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white">
        <Play className="h-3 w-3 translate-x-px fill-current" />
      </span>
      {typeof duration === "number" ? (
        <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 font-mono text-11 leading-4 text-white tabular-nums">
          {formatVideoTime(duration)}
        </span>
      ) : null}
    </span>
  );
}

/** A saved video shown as a finished composer tile (editing a post keeps its video). */
export function savedVideoDraft(video: PostVideo): VideoDraft {
  return {
    phase: "ready",
    id: 0,
    preview: { src: video.url, poster: video.poster, width: video.width, height: video.height, duration: video.duration },
    progress: 1,
    video,
    error: null,
  };
}
