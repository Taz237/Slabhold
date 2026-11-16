"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import {
  EMPTY_VIDEO_DRAFT,
  videoDraftActive,
  videoDraftBusy,
  videoDraftReducer,
  type VideoDraft,
} from "@/lib/social/video-draft";
import { isUploadAborted, uploadPostVideo } from "@/lib/social/video-upload";
import {
  VIDEO_BUCKET,
  VIDEO_READ_ERROR,
  VIDEO_UPLOAD_ERROR,
  postVideoPaths,
  videoFileProblem,
  videoMetadataProblem,
  videoMime,
  type PostVideo,
} from "@/lib/social/videos";

/**
 * The video on the post being written. A pick is checked (type, size, length),
 * a poster frame is drawn on the device, then both upload with real progress.
 * Remove cancels a running upload. Anything uploaded but never posted is
 * deleted again when the video is removed or the composer closes.
 */
export function useVideoDraft(userId: string | null | undefined) {
  const [draft, dispatch] = useReducer(videoDraftReducer, EMPTY_VIDEO_DRAFT);
  const nextId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const objectUrls = useRef<string[]>([]);
  /** Uploaded and not posted yet: removed again unless `posted()` is called. */
  const pending = useRef<PostVideo | null>(null);

  const revoke = useCallback(() => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current = [];
  }, []);

  const discardUploaded = useCallback(() => {
    const video = pending.current;
    pending.current = null;
    const paths = postVideoPaths(video);
    if (!paths.length) return;
    void loadSupabaseBrowser()
      .then((supabase) => supabase?.storage.from(VIDEO_BUCKET).remove(paths))
      .catch(() => {
        // Best effort. The post was never saved.
      });
  }, []);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
  }, []);

  const pick = useCallback(
    async (file: File) => {
      const problem = videoFileProblem(file);
      const mime = videoMime(file);
      if (problem || !mime) {
        dispatch({ type: "error", message: problem ?? VIDEO_READ_ERROR });
        return;
      }
      if (!userId) return;
      stop();
      discardUploaded();
      revoke();
      const id = ++nextId.current;
      dispatch({ type: "pick", id });
      const controller = new AbortController();
      abort.current = controller;
      try {
        const { readVideoFile } = await import("@/lib/ui/video-poster");
        const read = await readVideoFile(file, controller.signal);
        // Cancelled as the read finished: its URL was never handed out, so free it here.
        if (controller.signal.aborted) {
          URL.revokeObjectURL(read.src);
          return;
        }
        const posterUrl = URL.createObjectURL(read.poster);
        objectUrls.current.push(read.src, posterUrl);
        const tooLong = videoMetadataProblem(read);
        if (tooLong) {
          dispatch({ type: "failed", id, message: tooLong });
          revoke();
          return;
        }
        dispatch({
          type: "read",
          id,
          preview: { src: read.src, poster: posterUrl, width: read.width, height: read.height, duration: read.duration },
        });

        const supabase = await loadSupabaseBrowser();
        const session = supabase ? (await supabase.auth.getSession()).data.session : null;
        const { url, anonKey } = getSupabaseConfig();
        if (!supabase || !session?.access_token || !url) throw new Error(VIDEO_UPLOAD_ERROR);
        const video = await uploadPostVideo({
          origin: new URL(url).origin,
          anonKey,
          accessToken: session.access_token,
          userId,
          file,
          mime,
          poster: read.poster,
          width: read.width,
          height: read.height,
          duration: read.duration,
          signal: controller.signal,
          onProgress: (value) => dispatch({ type: "progress", id, value }),
          remove: async (paths) => {
            await supabase.storage.from(VIDEO_BUCKET).remove(paths);
          },
        });
        if (controller.signal.aborted || nextId.current !== id) {
          pending.current = video;
          discardUploaded();
          return;
        }
        pending.current = video;
        abort.current = null;
        dispatch({ type: "uploaded", id, video });
      } catch (error) {
        if (isUploadAborted(error) || controller.signal.aborted) return;
        dispatch({ type: "failed", id, message: error instanceof Error ? error.message : VIDEO_UPLOAD_ERROR });
        revoke();
      }
    },
    [discardUploaded, revoke, stop, userId],
  );

  /** X on the tile: cancels an upload, or takes off a finished one. */
  const remove = useCallback(() => {
    stop();
    discardUploaded();
    nextId.current += 1;
    dispatch({ type: "remove" });
    revoke();
  }, [discardUploaded, revoke, stop]);

  /** The post saved: its video stays in storage. */
  const posted = useCallback(() => {
    pending.current = null;
  }, []);

  const setError = useCallback((message: string | null) => dispatch({ type: "error", message }), []);

  // Closing the composer cancels an upload and removes an unposted video.
  useEffect(
    () => () => {
      stop();
      discardUploaded();
      revoke();
    },
    [discardUploaded, revoke, stop],
  );

  return {
    draft,
    pick,
    remove,
    posted,
    setError,
    busy: videoDraftBusy(draft),
    active: videoDraftActive(draft),
  };
}

export type VideoDraftControls = ReturnType<typeof useVideoDraft> & { draft: VideoDraft };
