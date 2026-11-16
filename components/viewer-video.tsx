"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { formatVideoTime, VIDEO_UNPLAYABLE, type PostVideo } from "@/lib/social/videos";
import { videoFocus } from "@/lib/ui/video-focus";

/** A video opened in the fullscreen viewer. */
export type LightboxVideo = PostVideo & {
  /** Where the timeline clip was, so it carries on from there. */
  startAt?: number;
  /** The viewer closed at this time; the timeline clip picks up from it. */
  onClose?: (time: number) => void;
};

type VideoState = {
  playing: boolean;
  time: number;
  duration: number;
  muted: boolean;
  failed: boolean;
};

/**
 * The viewer's video: plays with sound, from where the timeline left off.
 * iOS can refuse sound without a fresh tap; then it plays muted and the
 * speaker button turns it on.
 */
export function useViewerVideo(video: LightboxVideo | undefined) {
  const ref = useRef<HTMLVideoElement | null>(null);
  /** Set once the <video> is in the page, so the open effect below runs then. */
  const [mounted, setMounted] = useState(false);
  const attach = useCallback((node: HTMLVideoElement | null) => {
    ref.current = node;
    setMounted(Boolean(node));
  }, []);
  const [state, setState] = useState<VideoState>({
    playing: false,
    time: video?.startAt ?? 0,
    duration: video?.duration ?? 0,
    muted: false,
    failed: false,
  });

  const play = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const started = element.play() as Promise<void> | undefined;
    started?.catch(() => {
      // Sound refused: muted is always allowed.
      element.muted = true;
      setState((current) => ({ ...current, muted: true }));
      const again = element.play() as Promise<void> | undefined;
      again?.catch(() => setState((current) => ({ ...current, playing: false })));
    });
  }, []);

  // Open: carry on from the timeline's spot, with sound, while timeline clips pause.
  // Runs once: the element, the clip and play() stay the same while the viewer is open.
  useEffect(() => {
    const element = ref.current;
    if (!mounted || !element || !video) return;
    const release = videoFocus.hold();
    element.muted = false;
    if (video.startAt && video.startAt > 0 && video.startAt < video.duration) {
      try {
        element.currentTime = video.startAt;
      } catch {
        // Not seekable yet: it starts from the beginning.
      }
    }
    play();
    return () => {
      video.onClose?.(element.currentTime || 0);
      element.pause();
      release();
    };
  }, [mounted, play, video]);

  const toggle = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    if (element.paused) play();
    else element.pause();
  }, [play]);

  const seek = useCallback(
    (time: number) => {
      const element = ref.current;
      if (!element || !Number.isFinite(time)) return;
      element.currentTime = Math.max(0, Math.min(time, element.duration || time));
      setState((current) => ({ ...current, time: element.currentTime }));
    },
    [],
  );

  const toggleMute = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.muted = !element.muted;
    setState((current) => ({ ...current, muted: element.muted }));
    if (element.paused) play();
  }, [play]);

  const handlers = {
    onPlay: () => setState((current) => ({ ...current, playing: true })),
    onPause: () => setState((current) => ({ ...current, playing: false })),
    onTimeUpdate: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const time = event.currentTarget.currentTime;
      setState((current) => (Math.abs(current.time - time) < 0.2 ? current : { ...current, time }));
    },
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const duration = event.currentTarget.duration;
      if (Number.isFinite(duration) && duration > 0) setState((current) => ({ ...current, duration }));
    },
    onError: () => setState((current) => ({ ...current, failed: true, playing: false })),
  };

  return { attach, state, toggle, seek, toggleMute, handlers };
}

export type ViewerVideo = ReturnType<typeof useViewerVideo>;

/** The clip itself, inside the viewer's zoom box. */
export function ViewerVideoSurface({
  video,
  attach,
  handlers,
  failed,
}: {
  video: LightboxVideo;
  attach: ViewerVideo["attach"];
  handlers: ViewerVideo["handlers"];
  failed: boolean;
}) {
  if (failed) return <UnplayableTile poster={video.poster} />;
  return (
    <video
      ref={attach}
      data-viewer-video=""
      src={video.url}
      poster={video.poster}
      playsInline
      loop
      preload="auto"
      disablePictureInPicture
      aria-label="Video"
      {...handlers}
      className="relative h-full w-full bg-black object-contain"
    />
  );
}

/**
 * The viewer's dialog is touch-action: none so its swipes stay in JS. These
 * controls sit in the chrome layer (never on the swipe stage, so swipe-down
 * still closes) and ask for normal touch handling back.
 */
const TOUCHABLE: React.CSSProperties = { touchAction: "auto" };

/** Where on the scrubber a finger is, as a time. */
export function scrubTime(clientX: number, rect: { left: number; width: number }, duration: number): number {
  if (!(rect.width > 0) || !(duration > 0)) return 0;
  const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return fraction * duration;
}

/** "center": play/pause in the middle. "bar": the scrubber, the time and sound along the bottom. */
export function ViewerVideoControls({ player, placement }: { player: ViewerVideo; placement: "center" | "bar" }) {
  const { state } = player;
  if (state.failed) return null;
  const duration = state.duration || 0;
  if (placement === "center") {
    return (
      <button
        type="button"
        onClick={player.toggle}
        aria-label={state.playing ? "Pause" : "Play"}
        data-video-control=""
        style={TOUCHABLE}
        className="pointer-events-auto touch-auto absolute top-1/2 left-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white transition-transform duration-150 active:scale-95"
      >
        {state.playing ? (
          <Pause className="h-7 w-7 fill-current" aria-hidden="true" />
        ) : (
          <Play className="h-7 w-7 translate-x-0.5 fill-current" aria-hidden="true" />
        )}
      </button>
    );
  }
  return (
    <div data-video-scrubber="" style={TOUCHABLE} className="pointer-events-auto touch-auto mx-auto flex max-w-lg items-center gap-3 px-4 pb-2">
        <span className="w-10 shrink-0 font-mono text-12 text-white/90 tabular-nums">{formatVideoTime(state.time)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(0.1, duration)}
          step={0.05}
          value={Math.min(state.time, duration || state.time)}
          onChange={(event) => player.seek(Number(event.currentTarget.value))}
          // Also drag it from pointer events, which arrive even where iOS
          // won't move a native range under a touch-action: none ancestor.
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") return;
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Not supported: the native range still works.
            }
            player.seek(scrubTime(event.clientX, event.currentTarget.getBoundingClientRect(), duration));
          }}
          onPointerMove={(event) => {
            if (event.pointerType === "mouse" || !event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
            player.seek(scrubTime(event.clientX, event.currentTarget.getBoundingClientRect(), duration));
          }}
          aria-label="Seek"
          aria-valuetext={`${formatVideoTime(state.time)} of ${formatVideoTime(duration)}`}
          style={TOUCHABLE}
          className="video-scrubber h-11 min-w-0 flex-1 cursor-pointer touch-auto accent-[#7C3AED]"
        />
        <span className="w-10 shrink-0 text-right font-mono text-12 text-white/70 tabular-nums">
          {formatVideoTime(duration)}
        </span>
        <button
          type="button"
          onClick={player.toggleMute}
          aria-label={state.muted ? "Turn sound on" : "Mute"}
          data-video-control=""
          style={TOUCHABLE}
          className="touch-auto grid h-11 w-11 shrink-0 place-items-center rounded-full text-white active:bg-white/10"
        >
          {state.muted ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
        </button>
    </div>
  );
}

/** Shown in place of a clip this device can't play. Never a broken element. */
export function UnplayableTile({ poster, compact = false }: { poster?: string | null; compact?: boolean }) {
  const [posterOk, setPosterOk] = useState(Boolean(poster));
  return (
    <span
      data-video-unplayable=""
      role="img"
      aria-label={VIDEO_UNPLAYABLE}
      className="relative grid h-full w-full place-items-center overflow-hidden bg-[#18181B]"
    >
      {poster && posterOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          onError={() => setPosterOk(false)}
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
      ) : null}
      <span className={`relative text-center font-medium text-white/85 ${compact ? "text-12" : "text-14"}`}>
        {VIDEO_UNPLAYABLE}
      </span>
    </span>
  );
}
