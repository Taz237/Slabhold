import type { PostVideo } from "./videos";

/** What the composer shows before the upload is done: a local copy of the clip. */
export type VideoPreview = {
  /** Object URL of the picked file. */
  src: string;
  /** Object URL of the poster frame. */
  poster: string;
  width: number;
  height: number;
  duration: number;
};

/**
 * The video on the post being written.
 * empty -> reading (poster frame, length) -> uploading (progress) -> ready.
 * Every step carries the pick's id, so a late answer from a removed or
 * replaced pick is ignored.
 */
export type VideoDraft = {
  phase: "empty" | "reading" | "uploading" | "ready";
  id: number;
  preview: VideoPreview | null;
  /** 0 to 1. */
  progress: number;
  video: PostVideo | null;
  error: string | null;
};

export const EMPTY_VIDEO_DRAFT: VideoDraft = {
  phase: "empty",
  id: 0,
  preview: null,
  progress: 0,
  video: null,
  error: null,
};

export type VideoDraftAction =
  | { type: "pick"; id: number }
  | { type: "read"; id: number; preview: VideoPreview }
  | { type: "progress"; id: number; value: number }
  | { type: "uploaded"; id: number; video: PostVideo }
  | { type: "failed"; id: number; message: string }
  | { type: "error"; message: string | null }
  | { type: "remove" };

export function videoDraftReducer(state: VideoDraft, action: VideoDraftAction): VideoDraft {
  switch (action.type) {
    case "pick":
      return { ...EMPTY_VIDEO_DRAFT, phase: "reading", id: action.id };
    case "read":
      if (action.id !== state.id || state.phase !== "reading") return state;
      return { ...state, phase: "uploading", preview: action.preview, progress: 0, error: null };
    case "progress": {
      if (action.id !== state.id || state.phase !== "uploading") return state;
      const value = Number.isFinite(action.value) ? Math.min(1, Math.max(state.progress, action.value)) : state.progress;
      return value === state.progress ? state : { ...state, progress: value };
    }
    case "uploaded":
      if (action.id !== state.id || state.phase !== "uploading") return state;
      return { ...state, phase: "ready", progress: 1, video: action.video, error: null };
    case "failed":
      if (action.id !== state.id || state.phase === "empty") return state;
      return { ...EMPTY_VIDEO_DRAFT, id: state.id, error: action.message };
    case "error":
      return { ...state, error: action.message };
    case "remove":
      return { ...EMPTY_VIDEO_DRAFT, id: state.id };
    default:
      return state;
  }
}

/** A video is being read or uploaded: Post waits for it. */
export function videoDraftBusy(draft: Pick<VideoDraft, "phase">): boolean {
  return draft.phase === "reading" || draft.phase === "uploading";
}

/** The post has a video in it (in any phase). Photos and GIFs stay off. */
export function videoDraftActive(draft: Pick<VideoDraft, "phase">): boolean {
  return draft.phase !== "empty";
}

/** Whole percent for the bar and for screen readers. */
export function videoDraftPercent(draft: Pick<VideoDraft, "progress">): number {
  return Math.round(Math.min(1, Math.max(0, draft.progress)) * 100);
}
