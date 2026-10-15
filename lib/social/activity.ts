import type { Notification, PostComment, PostLike, PostRepost } from "./types";

const STORAGE_KEY = "slabhold.activity.v1";

/** Likes stay on-device. Reposts, comments, notifications, and messages are stored in Supabase when it is configured. */
export type ActivityStore = {
  likes: PostLike[];
  reposts: PostRepost[];
  comments: PostComment[];
  notifications: Notification[];
};

export const emptyActivity: ActivityStore = {
  likes: [],
  reposts: [],
  comments: [],
  notifications: [],
};

export function loadActivity(): ActivityStore {
  if (typeof window === "undefined") return emptyActivity;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyActivity;
    const parsed = JSON.parse(raw) as Partial<ActivityStore>;
    return {
      likes: parsed.likes ?? [],
      reposts: parsed.reposts ?? [],
      comments: parsed.comments ?? [],
      notifications: parsed.notifications ?? [],
    };
  } catch {
    return emptyActivity;
  }
}

export function saveActivity(store: ActivityStore) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function activityFrom(source: {
  likes?: PostLike[];
  reposts?: PostRepost[];
  comments?: PostComment[];
  notifications?: Notification[];
}): ActivityStore {
  return {
    likes: source.likes ?? [],
    reposts: source.reposts ?? [],
    comments: source.comments ?? [],
    notifications: source.notifications ?? [],
  };
}
