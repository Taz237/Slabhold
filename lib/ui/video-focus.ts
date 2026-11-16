import { pickAutoplay } from "@/lib/social/videos";

/**
 * One video plays at a time, like X. Every timeline video registers here and
 * reports how much of it is on screen; this decides which one plays.
 *
 * - `auto` videos start muted once 60% visible and pause when scrolled away.
 * - `hold()` pauses everything while the fullscreen viewer is open.
 */
export type VideoControls = {
  play: () => void;
  pause: () => void;
  /** False: never starts on its own (Reduce Motion, Low Data, a broken file). */
  auto: boolean;
};

type Entry = VideoControls & { ratio: number; top: number };

export function createVideoFocus() {
  const entries = new Map<string, Entry>();
  let current: string | null = null;
  let holds = 0;

  function settle() {
    let next: string | null = null;
    if (holds === 0) {
      const visible = new Map<string, { ratio: number; top: number }>();
      for (const [id, entry] of entries) if (entry.auto) visible.set(id, entry);
      next = pickAutoplay(visible, current);
    }
    if (next === current) return;
    if (current) entries.get(current)?.pause();
    current = next;
    if (next) entries.get(next)?.play();
  }

  return {
    register(id: string, controls: VideoControls): () => void {
      entries.set(id, { ...controls, ratio: 0, top: Infinity });
      return () => {
        entries.delete(id);
        if (current === id) {
          current = null;
          settle();
        }
      };
    },
    /** Keep the latest play, pause and auto without losing the position. */
    update(id: string, controls: Partial<VideoControls>) {
      const entry = entries.get(id);
      if (!entry) return;
      Object.assign(entry, controls);
      settle();
    },
    report(id: string, ratio: number, top: number) {
      const entry = entries.get(id);
      if (!entry) return;
      entry.ratio = ratio;
      entry.top = top;
      settle();
    },
    hold(): () => void {
      holds += 1;
      settle();
      let done = false;
      return () => {
        if (done) return;
        done = true;
        holds = Math.max(0, holds - 1);
        settle();
      };
    },
    playing(): string | null {
      return holds > 0 ? null : current;
    },
  };
}

export type VideoFocus = ReturnType<typeof createVideoFocus>;

/** The page's one focus. */
export const videoFocus: VideoFocus = createVideoFocus();
