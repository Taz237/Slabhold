import { VIDEO_BUCKET, VIDEO_UPLOAD_ERROR, type PostVideo, type VideoMime } from "./videos";

/**
 * Uploading a picked video straight to Supabase Storage with real progress.
 * supabase-js has no progress callback, so the two files go up over one
 * XMLHttpRequest each, to the same endpoint supabase-js uses, signed with the
 * viewer's own session. The poster goes first (it is small), then the video.
 * A cancel aborts the request and removes anything already stored.
 */

export type UploadRequest = {
  url: string;
  headers: Record<string, string>;
  body: Blob;
  onProgress: (loaded: number) => void;
  signal: AbortSignal;
};

/** Sends one file. Resolves with the HTTP status; rejects with an AbortError on cancel. */
export type UploadTransport = (request: UploadRequest) => Promise<{ status: number; body: string }>;

export class UploadAborted extends Error {
  constructor() {
    super("Upload cancelled");
    this.name = "AbortError";
  }
}

export function isUploadAborted(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** The browser transport: an XMLHttpRequest, so upload progress is real. */
export const xhrTransport: UploadTransport = (request) =>
  new Promise((resolve, reject) => {
    if (request.signal.aborted) {
      reject(new UploadAborted());
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", request.url);
    for (const [name, value] of Object.entries(request.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) request.onProgress(event.loaded);
    };
    const onAbort = () => xhr.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });
    const done = () => request.signal.removeEventListener("abort", onAbort);
    xhr.onload = () => {
      done();
      resolve({ status: xhr.status, body: typeof xhr.responseText === "string" ? xhr.responseText : "" });
    };
    xhr.onerror = () => {
      done();
      reject(new Error(VIDEO_UPLOAD_ERROR));
    };
    xhr.onabort = () => {
      done();
      reject(new UploadAborted());
    };
    xhr.send(request.body);
  });

export type VideoUploadInput = {
  /** https://<ref>.supabase.co */
  origin: string;
  anonKey: string;
  accessToken: string;
  userId: string;
  file: Blob;
  mime: VideoMime;
  poster: Blob;
  width: number;
  height: number;
  duration: number;
  /** 0 to 1, across both files. */
  onProgress?: (fraction: number) => void;
  signal: AbortSignal;
  /** Best-effort delete of stored paths, for a cancel or a failure. */
  remove: (paths: string[]) => Promise<void>;
  transport?: UploadTransport;
  newId?: () => string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The one shape the bucket accepts: <user id>/<uuid>.mp4|mov|jpg, all
 * lowercase, no subfolders. The extension comes from the type, never the
 * file name, so an iPhone IMG_0001.MOV is stored as .mov.
 */
export function videoObjectPath(userId: string, id: string, ext: "mp4" | "mov" | "jpg"): string {
  const owner = userId.trim().toLowerCase();
  const name = id.trim().toLowerCase();
  if (!UUID.test(owner) || !UUID.test(name)) throw new Error(VIDEO_UPLOAD_ERROR);
  return `${owner}/${name}.${ext}`;
}

function objectUrl(origin: string, path: string, isPublic: boolean): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${origin}/storage/v1/object/${isPublic ? "public/" : ""}${VIDEO_BUCKET}/${encoded}`;
}

function uploadMessage(status: number, body: string): string {
  if (status === 413 || /too large|exceeded the maximum/i.test(body)) {
    return "That video is too large to upload. Choose a shorter clip.";
  }
  return VIDEO_UPLOAD_ERROR;
}

/** Upload the poster then the video. Resolves with the PostVideo to save on the post. */
export async function uploadPostVideo(input: VideoUploadInput): Promise<PostVideo> {
  const transport = input.transport ?? xhrTransport;
  const newId = input.newId ?? (() => crypto.randomUUID());
  const ext = input.mime === "video/quicktime" ? "mov" : "mp4";
  const videoPath = videoObjectPath(input.userId, newId(), ext);
  const posterPath = videoObjectPath(input.userId, newId(), "jpg");
  const total = Math.max(1, input.poster.size + input.file.size);
  let posterDone = 0;
  let last = 0;
  const report = (loaded: number) => {
    const fraction = Math.min(1, Math.max(last, loaded / total));
    last = fraction;
    input.onProgress?.(fraction);
  };
  const headers = (contentType: string) => ({
    authorization: `Bearer ${input.accessToken}`,
    apikey: input.anonKey,
    "content-type": contentType,
    "x-upsert": "false",
    // Every path is new, so a long cache is safe.
    "cache-control": "max-age=31536000",
  });

  const stored: string[] = [];
  try {
    const poster = await transport({
      url: objectUrl(input.origin, posterPath, false),
      headers: headers("image/jpeg"),
      body: input.poster,
      onProgress: (loaded) => report(loaded),
      signal: input.signal,
    });
    if (poster.status < 200 || poster.status >= 300) throw new Error(uploadMessage(poster.status, poster.body));
    stored.push(posterPath);
    posterDone = input.poster.size;
    report(posterDone);

    const video = await transport({
      url: objectUrl(input.origin, videoPath, false),
      headers: headers(input.mime),
      body: input.file,
      onProgress: (loaded) => report(posterDone + loaded),
      signal: input.signal,
    });
    if (video.status < 200 || video.status >= 300) throw new Error(uploadMessage(video.status, video.body));
    stored.push(videoPath);
    report(total);
  } catch (error) {
    if (stored.length) await input.remove(stored).catch(() => {});
    if (input.signal.aborted || isUploadAborted(error)) throw new UploadAborted();
    throw error instanceof Error ? error : new Error(VIDEO_UPLOAD_ERROR);
  }

  return {
    url: objectUrl(input.origin, videoPath, true),
    poster: objectUrl(input.origin, posterPath, true),
    width: Math.round(input.width),
    height: Math.round(input.height),
    duration: Math.round(input.duration * 100) / 100,
    mime: input.mime,
  };
}
