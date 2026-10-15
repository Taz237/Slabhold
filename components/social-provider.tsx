"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { activityFrom, emptyActivity, loadActivity, saveActivity, type ActivityStore } from "@/lib/social/activity";
import {
  loadOrCreateLocalDb,
  localAddComment,
  localCreatePost,
  localDeletePost,
  localMarkNotificationsRead,
  localUpdatePost,
  localSignIn,
  localSignOut,
  localSignUp,
  localToggleFollow,
  localToggleLike,
  localToggleRepost,
  localUpdateProfile,
  saveLocalDb,
  snapshotFromLocal,
  type LocalDb,
} from "@/lib/social/local-db";
import {
  loadSupabaseSocial,
  remoteCreatePost,
  remoteDeletePost,
  remoteSignIn,
  remoteSignOut,
  remoteSignUp,
  remoteToggleFollow,
  remoteUpdatePost,
  remoteUpdateProfile,
} from "@/lib/social/remote";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { getSupabaseConfig } from "@/lib/supabase/client";
import type {
  AuthResult,
  Notification,
  Post,
  PostComment,
  Profile,
  ProfilePatch,
  PublicCard,
  SignUpInput,
  SocialSnapshot,
} from "@/lib/social/types";

type SocialContextValue = {
  ready: boolean;
  mode: "local" | "supabase";
  user: Profile | null;
  profiles: Profile[];
  posts: Post[];
  publicCards: SocialSnapshot["publicCards"];
  status: string | null;
  refresh: () => Promise<void>;
  signUp: (input: SignUpInput) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<AuthResult>;
  toggleFollow: (userId: string) => Promise<void>;
  isFollowing: (userId: string) => boolean;
  followerCount: (userId: string) => number;
  followingCount: (userId: string) => number;
  createPost: (input: {
    body: string;
    imageDataUrl: string | null;
    card: PublicCard | null;
  }) => Promise<AuthResult>;
  updatePost: (
    postId: string,
    input: { body: string; imageDataUrl: string | null },
  ) => Promise<AuthResult>;
  deletePost: (postId: string) => Promise<AuthResult>;
  toggleLike: (postId: string) => void;
  toggleRepost: (postId: string) => void;
  addComment: (postId: string, body: string) => AuthResult;
  isLiked: (postId: string) => boolean;
  isReposted: (postId: string) => boolean;
  likeCount: (postId: string) => number;
  repostCount: (postId: string) => number;
  commentsFor: (postId: string) => PostComment[];
  notifications: Notification[];
  unreadCount: number;
  markNotificationsRead: () => void;
  feed: Post[];
  suggestions: Profile[];
  profileByUsername: (username: string) => Profile | undefined;
};

const SocialContext = createContext<SocialContextValue | null>(null);

const emptySnapshot: SocialSnapshot = {
  user: null,
  profiles: [],
  posts: [],
  follows: [],
  likes: [],
  reposts: [],
  comments: [],
  notifications: [],
  publicCards: [],
};

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"local" | "supabase">("local");
  const [local, setLocal] = useState<LocalDb | null>(null);
  const [remote, setRemote] = useState<SocialSnapshot>(emptySnapshot);
  const [status, setStatus] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityStore>(emptyActivity);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const localRef = useRef<LocalDb | null>(null);
  localRef.current = local;

  const refreshRemote = useCallback(async (client: SupabaseClient) => {
    const snapshot = await loadSupabaseSocial(client);
    setRemote(snapshot);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const client = createSupabaseBrowser();
    setActivity(loadActivity());
    if (!client) {
      const { issue } = getSupabaseConfig();
      if (issue) setStatus(issue);
      loadOrCreateLocalDb().then((db) => {
        if (cancelled) return;
        setMode("local");
        setLocal(db);
        setReady(true);
      });
      return () => {
        cancelled = true;
      };
    }

    supabaseRef.current = client;
    setMode("supabase");
    refreshRemote(client)
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Could not reach Supabase.");
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    const { data } = client.auth.onAuthStateChange(() => {
      setTimeout(() => {
        refreshRemote(client).catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : "Could not reach Supabase.");
        });
      }, 0);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [refreshRemote]);

  const baseSnapshot = mode === "local" && local ? snapshotFromLocal(local) : remote;
  const snapshot =
    mode === "supabase"
      ? {
          ...baseSnapshot,
          likes: activity.likes,
          reposts: activity.reposts,
          comments: activity.comments,
          notifications: activity.notifications,
        }
      : baseSnapshot;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const rememberActivity = useCallback((db: LocalDb) => {
    const next = activityFrom(db);
    saveActivity(next);
    setActivity(next);
  }, []);

  const activityShell = useCallback((): LocalDb => {
    const current = snapshotRef.current;
    return {
      users: [],
      sessionUserId: current.user?.id ?? null,
      follows: current.follows,
      posts: current.posts,
      likes: current.likes,
      reposts: current.reposts,
      comments: current.comments,
      notifications: current.notifications,
      collections: {},
    };
  }, []);

  const commitLocal = useCallback((db: LocalDb) => {
    saveLocalDb(db);
    setLocal(db);
  }, []);

  const refresh = useCallback(async () => {
    const client = supabaseRef.current;
    if (mode === "supabase" && client) {
      await refreshRemote(client);
      return;
    }
    setLocal(await loadOrCreateLocalDb());
  }, [mode, refreshRemote]);

  const signUp = useCallback(
    async (input: SignUpInput): Promise<AuthResult> => {
      const client = supabaseRef.current;
      if (mode === "supabase" && client) {
        try {
          const result = await remoteSignUp(client, input);
          if (!result.error && !result.notice) await refreshRemote(client);
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not create that account." };
        }
      }
      const current = localRef.current;
      if (!current) return { error: "Still loading." };
      const result = await localSignUp(current, input);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode, refreshRemote],
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const client = supabaseRef.current;
      if (mode === "supabase" && client) {
        try {
          const result = await remoteSignIn(client, email, password);
          if (!result.error) await refreshRemote(client);
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not log in." };
        }
      }
      const current = localRef.current;
      if (!current) return { error: "Still loading." };
      const result = await localSignIn(current, email, password);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode, refreshRemote],
  );

  const signOut = useCallback(async () => {
    const client = supabaseRef.current;
    if (mode === "supabase" && client) {
      await remoteSignOut(client);
      await refreshRemote(client);
      return;
    }
    if (localRef.current) commitLocal(localSignOut(localRef.current));
  }, [commitLocal, mode, refreshRemote]);

  const updateProfile = useCallback(
    async (patch: ProfilePatch): Promise<AuthResult> => {
      const client = supabaseRef.current;
      if (mode === "supabase" && client && snapshot.user) {
        try {
          const result = await remoteUpdateProfile(client, snapshot.user.id, patch);
          if (!result.error) await refreshRemote(client);
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not save your profile." };
        }
      }
      const current = localRef.current;
      if (!current) return { error: "Still loading." };
      const result = localUpdateProfile(current, patch);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode, refreshRemote, snapshot.user],
  );

  const isFollowing = useCallback(
    (userId: string) =>
      Boolean(
        snapshot.user &&
          snapshot.follows.some(
            (edge) => edge.followerId === snapshot.user?.id && edge.followingId === userId,
          ),
      ),
    [snapshot.follows, snapshot.user],
  );

  const toggleFollow = useCallback(
    async (userId: string) => {
      if (!snapshot.user || snapshot.user.id === userId) return;
      const client = supabaseRef.current;
      if (mode === "supabase" && client) {
        rememberActivity(localToggleFollow(activityShell(), userId));
        await remoteToggleFollow(client, snapshot.user.id, userId, isFollowing(userId));
        await refreshRemote(client);
        return;
      }
      if (localRef.current) commitLocal(localToggleFollow(localRef.current, userId));
    },
    [commitLocal, isFollowing, mode, refreshRemote, snapshot.user],
  );

  const createPost = useCallback(
    async (input: {
      body: string;
      imageDataUrl: string | null;
      card: PublicCard | null;
    }): Promise<AuthResult> => {
      const client = supabaseRef.current;
      if (mode === "supabase" && client && snapshot.user) {
        try {
          const result = await remoteCreatePost(client, snapshot.user.id, input);
          if (!result.error) await refreshRemote(client);
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not publish that post." };
        }
      }
      const current = localRef.current;
      if (!current) return { error: "Still loading." };
      const result = localCreatePost(current, input);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode, refreshRemote, snapshot.user],
  );

  const updatePost = useCallback(
    async (
      postId: string,
      input: { body: string; imageDataUrl: string | null },
    ): Promise<AuthResult> => {
      const client = supabaseRef.current;
      if (mode === "supabase" && client && snapshot.user) {
        try {
          const result = await remoteUpdatePost(client, snapshot.user.id, postId, input);
          if (!result.error) await refreshRemote(client);
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not update that post." };
        }
      }
      const current = localRef.current;
      if (!current) return { error: "Still loading." };
      const result = localUpdatePost(current, postId, input);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode, refreshRemote, snapshot.user],
  );

  const deletePost = useCallback(
    async (postId: string): Promise<AuthResult> => {
      const client = supabaseRef.current;
      if (mode === "supabase" && client && snapshot.user) {
        try {
          const result = await remoteDeletePost(client, snapshot.user.id, postId);
          if (!result.error) {
            rememberActivity(localDeletePost(activityShell(), postId).db);
            await refreshRemote(client);
          }
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not delete that post." };
        }
      }
      const current = localRef.current;
      if (!current) return { error: "Still loading." };
      const result = localDeletePost(current, postId);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode, refreshRemote, snapshot.user],
  );

  const toggleLike = useCallback(
    (postId: string) => {
      if (!snapshot.user) return;
      if (mode === "supabase") {
        rememberActivity(localToggleLike(activityShell(), postId));
        return;
      }
      if (!localRef.current) return;
      commitLocal(localToggleLike(localRef.current, postId));
    },
    [commitLocal, mode, snapshot.user],
  );

  const toggleRepost = useCallback(
    (postId: string) => {
      if (!snapshot.user) return;
      if (mode === "supabase") {
        rememberActivity(localToggleRepost(activityShell(), postId));
        return;
      }
      if (!localRef.current) return;
      commitLocal(localToggleRepost(localRef.current, postId));
    },
    [commitLocal, mode, snapshot.user],
  );

  const addComment = useCallback(
    (postId: string, body: string): AuthResult => {
      if (mode === "supabase") {
        if (!snapshot.user) return { error: "Log in to comment." };
        const result = localAddComment(activityShell(), postId, body);
        if (!result.error) rememberActivity(result.db);
        return { error: result.error };
      }
      if (!localRef.current) return { error: "Still loading." };
      const result = localAddComment(localRef.current, postId, body);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode, snapshot.user],
  );

  const isLiked = useCallback(
    (postId: string) =>
      Boolean(
        snapshot.user &&
          snapshot.likes.some((like) => like.postId === postId && like.userId === snapshot.user?.id),
      ),
    [snapshot.likes, snapshot.user],
  );

  const isReposted = useCallback(
    (postId: string) =>
      Boolean(
        snapshot.user &&
          snapshot.reposts.some(
            (repost) => repost.postId === postId && repost.userId === snapshot.user?.id,
          ),
      ),
    [snapshot.reposts, snapshot.user],
  );

  const likeCount = useCallback(
    (postId: string) => snapshot.likes.filter((like) => like.postId === postId).length,
    [snapshot.likes],
  );

  const repostCount = useCallback(
    (postId: string) => snapshot.reposts.filter((repost) => repost.postId === postId).length,
    [snapshot.reposts],
  );

  const notifications = useMemo(() => {
    if (!snapshot.user) return [];
    return snapshot.notifications
      .filter((note) => note.recipientId === snapshot.user?.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [snapshot.notifications, snapshot.user]);

  const unreadCount = notifications.filter((note) => !note.read).length;

  const markNotificationsRead = useCallback(() => {
    if (!snapshot.user) return;
    if (!snapshot.notifications.some((note) => note.recipientId === snapshot.user?.id && !note.read)) {
      return;
    }
    if (mode === "supabase") {
      rememberActivity(localMarkNotificationsRead(activityShell()));
      return;
    }
    if (!localRef.current) return;
    commitLocal(localMarkNotificationsRead(localRef.current));
  }, [commitLocal, mode, snapshot.notifications, snapshot.user]);

  const commentsFor = useCallback(
    (postId: string) =>
      snapshot.comments
        .filter((comment) => comment.postId === postId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [snapshot.comments],
  );

  const followerCount = useCallback(
    (userId: string) => snapshot.follows.filter((edge) => edge.followingId === userId).length,
    [snapshot.follows],
  );
  const followingCount = useCallback(
    (userId: string) => snapshot.follows.filter((edge) => edge.followerId === userId).length,
    [snapshot.follows],
  );

  const feed = useMemo(() => {
    if (!snapshot.user) return snapshot.posts;
    const ids = new Set<string>([snapshot.user.id]);
    for (const edge of snapshot.follows) {
      if (edge.followerId === snapshot.user.id) ids.add(edge.followingId);
    }
    return snapshot.posts.filter((post) => ids.has(post.authorId));
  }, [snapshot.follows, snapshot.posts, snapshot.user]);

  const suggestions = useMemo(() => {
    if (!snapshot.user) return snapshot.profiles;
    return snapshot.profiles.filter(
      (profile) => profile.id !== snapshot.user?.id && !isFollowing(profile.id),
    );
  }, [isFollowing, snapshot.profiles, snapshot.user]);

  const profileByUsername = useCallback(
    (username: string) =>
      snapshot.profiles.find((profile) => profile.username === username.trim().toLowerCase()),
    [snapshot.profiles],
  );

  const value = useMemo<SocialContextValue>(
    () => ({
      ready,
      mode,
      user: snapshot.user,
      profiles: snapshot.profiles,
      posts: snapshot.posts,
      publicCards: snapshot.publicCards,
      status,
      refresh,
      signUp,
      signIn,
      signOut,
      updateProfile,
      toggleFollow,
      isFollowing,
      followerCount,
      followingCount,
      createPost,
      updatePost,
      deletePost,
      toggleLike,
      toggleRepost,
      addComment,
      isLiked,
      isReposted,
      likeCount,
      repostCount,
      commentsFor,
      notifications,
      unreadCount,
      markNotificationsRead,
      feed,
      suggestions,
      profileByUsername,
    }),
    [
      addComment,
      commentsFor,
      markNotificationsRead,
      notifications,
      createPost,
      updatePost,
      deletePost,
      feed,
      followerCount,
      isLiked,
      isReposted,
      likeCount,
      repostCount,
      followingCount,
      isFollowing,
      mode,
      profileByUsername,
      ready,
      refresh,
      signIn,
      signOut,
      signUp,
      snapshot.posts,
      snapshot.profiles,
      snapshot.publicCards,
      snapshot.user,
      status,
      suggestions,
      toggleFollow,
      toggleLike,
      toggleRepost,
      unreadCount,
      updateProfile,
    ],
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error("useSocial must be used inside SocialProvider");
  return ctx;
}
