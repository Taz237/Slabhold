/**
 * One short video on a post or a reply. Stored on posts.video / comments.video
 * as { url, poster, width, height, duration, mime }. The file and its poster
 * live in the post-videos bucket under the author's id:
 *   post-videos/<user id>/<uuid>.mp4|mov   the video
 *   post-videos/<user id>/<uuid>.jpg       the poster (a frame from the video)
 * Width and height are the shape it plays at, so a timeline can reserve the
 * exact space before anything loads.
 */
export type PostVideo = {
  url: string;
  poster: string;
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  mime: VideoMime;
};

export type VideoMime = "video/mp4" | "video/quicktime";

export const VIDEO_BUCKET = "post-videos";
export const VIDEO_MAX_SECONDS = 60;
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
/** Metadata can round a 60 second clip up a little. Same slack as the database. */
const DURATION_SLACK = 0.5;
const MAX_SIDE = 8192;

/** The library picker: photos, plus MP4 and MOV (the iPhone camera roll). */
export const VIDEO_ACCEPT = "video/mp4,video/quicktime,.mp4,.mov";

export const VIDEO_TYPE_ERROR = "Choose an MP4 or MOV video.";
export const VIDEO_TOO_LARGE_ERROR = "That video is over 100 MB. Choose a shorter clip.";
export const VIDEO_TOO_LONG_ERROR = "Videos can be up to 60 seconds. Trim it in Photos and try again.";
export const VIDEO_READ_ERROR = "Couldn't open that video. Try another one.";
export const VIDEO_UPLOAD_ERROR = "Couldn't upload that video. Check your connection and try again.";
export const VIDEO_ONE_ERROR = "You can add one video to a post.";
export const VIDEO_MIX_ERROR = "A post can have photos or one video, not both.";
export const VIDEO_GIF_ERROR = "A post can have a GIF or a video, not both.";
export const VIDEO_THREAD_ERROR = "Videos go on a single post for now.";
export const VIDEOS_UNAVAILABLE = "Videos aren't available yet. Post without the video.";
export const VIDEO_UNPLAYABLE = "Can't play this video";

const MOV_NAME = /\.mov$/i;
const MP4_NAME = /\.(mp4|m4v)$/i;

type FileLike = { type?: string | null; name?: string | null; size?: number | null };

/** MP4 or MOV, from the MIME type or, when iOS leaves that empty, the file name. */
export function videoMime(file: FileLike): VideoMime | null {
  const type = (file.type ?? "").toLowerCase();
  if (type === "video/mp4" || type === "video/x-m4v") return "video/mp4";
  if (type === "video/quicktime") return "video/quicktime";
  if (type) return null;
  const name = file.name ?? "";
  if (MP4_NAME.test(name)) return "video/mp4";
  if (MOV_NAME.test(name)) return "video/quicktime";
  return null;
}

export function isVideoFile(file: FileLike): boolean {
  const type = (file.type ?? "").toLowerCase();
  if (type.startsWith("video/")) return true;
  if (type) return false;
  return MP4_NAME.test(file.name ?? "") || MOV_NAME.test(file.name ?? "");
}

/** Checked before anything is read: the type and the size. */
export function videoFileProblem(file: FileLike): string | null {
  if (!videoMime(file)) return VIDEO_TYPE_ERROR;
  const size = typeof file.size === "number" ? file.size : NaN;
  if (!Number.isFinite(size) || size <= 0) return VIDEO_READ_ERROR;
  if (size > VIDEO_MAX_BYTES) return VIDEO_TOO_LARGE_ERROR;
  return null;
}

/** Checked once the browser has read the length and the frame size. */
export function videoMetadataProblem(meta: { duration: number; width: number; height: number }): string | null {
  if (!Number.isFinite(meta.duration) || meta.duration <= 0) return VIDEO_READ_ERROR;
  if (meta.duration > VIDEO_MAX_SECONDS + DURATION_SLACK) return VIDEO_TOO_LONG_ERROR;
  if (!(meta.width > 0) || !(meta.height > 0)) return VIDEO_READ_ERROR;
  return null;
}

/** Both checks at once: what the composer shows, or null when the clip fits. */
export function checkVideoLimits(
  file: FileLike,
  meta: { duration: number; width: number; height: number },
): string | null {
  return videoFileProblem(file) ?? videoMetadataProblem(meta);
}

/** "0:07", "1:00". Never negative. */
export function formatVideoTime(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

/** What is left to play, rounded up, so the pill reaches 0:00 only at the end. */
export function videoTimeLeft(duration: number, currentTime: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const at = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
  return Math.max(0, Math.ceil(duration - at));
}

/** What a screen reader hears for a video. */
export function videoLabel(video: Pick<PostVideo, "duration">): string {
  return `Video, ${formatVideoTime(video.duration)}`;
}

// ---------------------------------------------------------------------------
// Stored URLs
// ---------------------------------------------------------------------------

const VIDEO_PATH = new RegExp(
  `^/storage/v1/object/public/${VIDEO_BUCKET}/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(mp4|mov|jpg)$`,
);

function supabaseOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * True for a public object in this project's post-videos bucket with the
 * right file type. `owner`, when given, must be the folder it sits in.
 */
export function isPostVideoUrl(value: unknown, kind: "video" | "poster", owner?: string): value is string {
  if (typeof value !== "string" || value.length > 600) return false;
  const origin = supabaseOrigin();
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.origin !== origin || url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    return false;
  }
  if (value !== `${origin}${url.pathname}`) return false;
  const match = VIDEO_PATH.exec(url.pathname);
  if (!match) return false;
  if (owner && match[1] !== owner.toLowerCase()) return false;
  return kind === "poster" ? match[2] === "jpg" : match[2] !== "jpg";
}

/** The bucket path of a stored video or poster URL, for removing it. */
export function postVideoPath(value: unknown): string | null {
  if (!isPostVideoUrl(value, "video") && !isPostVideoUrl(value, "poster")) return null;
  const marker = `/storage/v1/object/public/${VIDEO_BUCKET}/`;
  const path = new URL(value as string).pathname;
  return path.slice(path.indexOf(marker) + marker.length);
}

/** Both objects a stored video owns: the file and its poster. */
export function postVideoPaths(video: Pick<PostVideo, "url" | "poster"> | null | undefined): string[] {
  if (!video) return [];
  return [postVideoPath(video.url), postVideoPath(video.poster)].filter((path): path is string => Boolean(path));
}

function side(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 1 && rounded <= MAX_SIDE ? rounded : null;
}

/** A stored or uploaded video we will render, or null. Unknown keys are dropped. */
export function sanitizeVideo(value: unknown, owner?: string): PostVideo | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const width = side(raw.width);
  const height = side(raw.height);
  const duration = typeof raw.duration === "number" && Number.isFinite(raw.duration) ? raw.duration : NaN;
  if (width === null || height === null) return null;
  if (!(duration > 0) || duration > VIDEO_MAX_SECONDS + DURATION_SLACK) return null;
  if (raw.mime !== "video/mp4" && raw.mime !== "video/quicktime") return null;
  if (!isPostVideoUrl(raw.url, "video", owner) || !isPostVideoUrl(raw.poster, "poster", owner)) return null;
  return {
    url: raw.url,
    poster: raw.poster,
    width,
    height,
    duration: Math.round(duration * 100) / 100,
    mime: raw.mime,
  };
}

/** A missing posts.video or comments.video column, before the migration is applied. */
export function videoColumnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (error.code !== "PGRST204" && error.code !== "42703" && !/column/i.test(message)) return false;
  return /\bvideo\b/i.test(message);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * The timeline box, from the saved shape. Wide and square clips keep their
 * real shape. A tall phone clip sits in a 4:5 frame and fills it, so one
 * video never takes a whole screen of feed.
 */
export function feedVideoAspect(video: Pick<PostVideo, "width" | "height">): string {
  if (video.height > video.width * 1.25) return "4 / 5";
  return `${video.width} / ${video.height}`;
}

/** True when the timeline frame crops the clip (tall clips only). */
export function feedVideoCrops(video: Pick<PostVideo, "width" | "height">): boolean {
  return video.height > video.width * 1.25;
}

// ---------------------------------------------------------------------------
// Composer rules
// ---------------------------------------------------------------------------

/**
 * What a pick from the library becomes. One video per post, and a post has
 * photos, a GIF or one video, never a mix.
 */
export function planMediaPick<T extends FileLike>(
  files: readonly T[],
  current: { photos: number; hasVideo: boolean; hasGif: boolean; videoAllowed: boolean; threaded?: boolean },
): { kind: "photos"; files: T[] } | { kind: "video"; file: T } | { kind: "error"; message: string } | { kind: "none" } {
  const list = files.filter(Boolean);
  if (list.length === 0) return { kind: "none" };
  const videos = list.filter(isVideoFile);
  const photos = list.filter((file) => !isVideoFile(file));
  if (videos.length === 0) {
    if (current.hasVideo) return { kind: "error", message: VIDEO_MIX_ERROR };
    return { kind: "photos", files: photos };
  }
  if (!current.videoAllowed) return { kind: "error", message: VIDEO_TYPE_ERROR_PHOTOS_ONLY };
  if (current.threaded) return { kind: "error", message: VIDEO_THREAD_ERROR };
  if (photos.length > 0 || current.photos > 0) return { kind: "error", message: VIDEO_MIX_ERROR };
  if (videos.length > 1 || current.hasVideo) return { kind: "error", message: VIDEO_ONE_ERROR };
  if (current.hasGif) return { kind: "error", message: VIDEO_GIF_ERROR };
  return { kind: "video", file: videos[0]! };
}

/** A video picked where videos aren't on yet. */
export const VIDEO_TYPE_ERROR_PHOTOS_ONLY = "Choose a photo. Videos aren't available here yet.";

/** Accept string for the library input, with or without video. */
export function libraryAccept(photoAccept: string, withVideo: boolean): string {
  return withVideo ? `${photoAccept},${VIDEO_ACCEPT}` : photoAccept;
}

// ---------------------------------------------------------------------------
// Autoplay
// ---------------------------------------------------------------------------

/** A feed video starts once this much of it is on screen. */
export const AUTOPLAY_RATIO = 0.6;

/** Reduce Motion or Low Data: nothing starts on its own. */
export function autoplayAllowed(input: { reducedMotion: boolean; saveData: boolean }): boolean {
  return !input.reducedMotion && !input.saveData;
}

/**
 * Which feed video plays, given how much of each is on screen. Only one plays.
 * The one playing keeps playing while it is still 60% visible, so two clips
 * on screen don't trade places on every scroll. Otherwise the most visible
 * clip wins, the higher one on a tie.
 */
export function pickAutoplay(
  visible: ReadonlyMap<string, { ratio: number; top: number }>,
  current: string | null,
): string | null {
  if (current) {
    const still = visible.get(current);
    if (still && still.ratio >= AUTOPLAY_RATIO) return current;
  }
  let best: string | null = null;
  let bestRatio = 0;
  let bestTop = Infinity;
  for (const [id, { ratio, top }] of visible) {
    if (ratio < AUTOPLAY_RATIO) continue;
    if (ratio > bestRatio + 0.001 || (Math.abs(ratio - bestRatio) <= 0.001 && top < bestTop)) {
      best = id;
      bestRatio = ratio;
      bestTop = top;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Database support
// ---------------------------------------------------------------------------

let videoSupport: boolean | null = null;

export function noteVideoMissing() {
  videoSupport = false;
}

export function resetVideoSupport() {
  videoSupport = null;
}

/** True once a read showed posts.video isn't there yet. Reads then leave it out. */
export function videoKnownMissing(): boolean {
  return videoSupport === false;
}

type ColumnProbe = {
  from: (table: string) => { select: (columns: string) => { limit: (n: number) => PromiseLike<{ error: { code?: string; message?: string } | null }> } };
};

/**
 * True when posts and comments can store a video. Until the migration is
 * applied the composer offers photos only, as before.
 */
export async function postsSupportVideo(supabase: ColumnProbe): Promise<boolean> {
  if (videoSupport != null) return videoSupport;
  const [posts, comments] = await Promise.all([
    supabase.from("posts").select("video").limit(1),
    supabase.from("comments").select("video").limit(1),
  ]);
  // Only a missing column turns videos off. Any other error leaves them on.
  videoSupport = !(videoColumnMissing(posts.error) || videoColumnMissing(comments.error));
  return videoSupport;
}
