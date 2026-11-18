import { VIDEO_READ_ERROR } from "@/lib/social/videos";

/**
 * Reads a picked video in the browser: its length, the shape it plays at, and
 * a poster frame drawn with a <canvas>, so a timeline never shows a black box.
 * Nothing leaves the device here.
 */

export type ReadVideo = {
  /** Object URL of the file. The caller revokes it. */
  src: string;
  width: number;
  height: number;
  duration: number;
  poster: Blob;
};

/** Longest side of the poster. Big enough for a full-width phone frame. */
const POSTER_MAX_SIDE = 1280;
const METADATA_TIMEOUT_MS = 15000;
const SEEK_TIMEOUT_MS = 4000;

/**
 * True when a small sample of a frame is almost all black (a fade-in) or one
 * flat colour. `rgba` is ImageData.data.
 */
export function frameLooksBlank(rgba: ArrayLike<number>): boolean {
  let pixels = 0;
  let sum = 0;
  let sumSquares = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const luma = 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
    sum += luma;
    sumSquares += luma * luma;
    pixels += 1;
  }
  if (pixels === 0) return true;
  const mean = sum / pixels;
  const spread = Math.sqrt(Math.max(0, sumSquares / pixels - mean * mean));
  return mean < 14 || spread < 3;
}

/** The moments tried for a poster, first good one wins. */
export function posterTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const times = [0.1, 1, duration * 0.25, duration * 0.5].map((t) => Math.min(t, Math.max(0, duration - 0.05)));
  return [...new Set(times.map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
}

/** The poster's size: the clip's shape, longest side at most 1280. */
export function posterSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, POSTER_MAX_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A cancelled read. The hook ignores it: the pick was removed or replaced. */
export class VideoReadAborted extends Error {
  constructor() {
    super("Video read cancelled");
    this.name = "AbortError";
  }
}

function stopIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new VideoReadAborted();
}

/** Waits for one event. False on an error, a timeout or a cancel. */
function once(target: HTMLVideoElement, event: string, ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      target.removeEventListener(event, onEvent);
      target.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      window.clearTimeout(timer);
      resolve(ok);
    };
    const onEvent = () => finish(true);
    const onError = () => finish(false);
    const onAbort = () => finish(false);
    target.addEventListener(event, onEvent);
    target.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort);
    const timer = window.setTimeout(() => finish(false), ms);
    if (signal?.aborted) finish(false);
  });
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82);
    } catch {
      resolve(null);
    }
  });
}

/** A plain ink-coloured frame, for a clip this browser can't draw. Still the clip's shape. */
async function plainPoster(width: number, height: number): Promise<Blob | null> {
  const size = posterSize(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#18181B";
  context.fillRect(0, 0, size.width, size.height);
  return toJpeg(canvas);
}

/**
 * `signal` cancels the read at its next step. A cancelled read always revokes
 * its object URL and rejects with an AbortError, so nothing leaks.
 */
export async function readVideoFile(file: File, signal?: AbortSignal): Promise<ReadVideo> {
  stopIfAborted(signal);
  const src = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.preload = "auto";
  video.src = src;
  try {
    const loaded = video.readyState >= 1 || (await once(video, "loadedmetadata", METADATA_TIMEOUT_MS, signal));
    stopIfAborted(signal);
    if (!loaded) throw new Error(VIDEO_READ_ERROR);
    const duration = video.duration;
    let width = video.videoWidth;
    let height = video.videoHeight;
    if (!(width > 0 && height > 0)) {
      // Some engines know the frame size only once a frame is decoded.
      await once(video, "loadeddata", SEEK_TIMEOUT_MS, signal);
      stopIfAborted(signal);
      width = video.videoWidth;
      height = video.videoHeight;
    }
    if (!(width > 0 && height > 0) || !Number.isFinite(duration)) {
      throw new Error(VIDEO_READ_ERROR);
    }

    // iOS Safari draws nothing from a video that has never played. A muted
    // play-and-pause wakes the decoder; it is allowed after the pick's tap.
    try {
      await video.play();
    } catch {
      // Refused (Low Power Mode): seeking alone usually still works.
    }
    video.pause();
    stopIfAborted(signal);

    const size = posterSize(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const sample = document.createElement("canvas");
    sample.width = 24;
    sample.height = 24;
    const sampleContext = sample.getContext("2d", { willReadFrequently: true });

    let poster: Blob | null = null;
    let drewAny = false;
    if (context && sampleContext) {
      for (const time of posterTimes(duration)) {
        if (Math.abs(video.currentTime - time) > 0.01) {
          video.currentTime = time;
          const sought = await once(video, "seeked", SEEK_TIMEOUT_MS, signal);
          stopIfAborted(signal);
          if (!sought) continue;
        }
        try {
          context.drawImage(video, 0, 0, size.width, size.height);
          drewAny = true;
          sampleContext.drawImage(canvas, 0, 0, sample.width, sample.height);
          const blank = frameLooksBlank(sampleContext.getImageData(0, 0, sample.width, sample.height).data);
          if (!blank) {
            poster = await toJpeg(canvas);
            if (poster) break;
          }
        } catch {
          // This frame couldn't be drawn. Try the next moment.
        }
      }
      // Every frame was dark: the last one drawn is still the real clip.
      if (!poster && drewAny) poster = await toJpeg(canvas);
    }
    poster ??= await plainPoster(width, height);
    stopIfAborted(signal);
    if (!poster) throw new Error(VIDEO_READ_ERROR);
    return { src, width, height, duration, poster };
  } catch (error) {
    // Failed or cancelled: the caller never sees this URL, so it goes here.
    URL.revokeObjectURL(src);
    throw error instanceof Error ? error : new Error(VIDEO_READ_ERROR);
  } finally {
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      // Detached already.
    }
  }
}
