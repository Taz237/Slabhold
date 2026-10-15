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
  localMarkThreadRead,
  localSendMessage,
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
  remoteAddComment,
  remoteCreatePost,
  remoteDeletePost,
  remoteMarkNotificationsRead,
  remoteMarkThreadRead,
  remoteSendMessage,
  remoteSignIn,
  remoteSignOut,
  remoteSignUp,
  remoteSyncLikeNotification,
  remoteToggleFollow,
  remoteToggleRepost,
  remoteUpdatePost,
  remoteUpdateProfile,
} from "@/lib/social/remote";
import { followingTimeline, type TimelineItem } from "@/lib/social/timeline";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { getSupabaseConfig } from "@/lib/supabase/client";
import type {
  AuthResult,
  DirectMessage,
  Notification,
  Post,
  PostComment,
  PostRepost,
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
  followersOf: (userId: string) => Profile[];
  followingOf: (userId: string) => Profile[];
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
  addComment: (postId: string, body: string) => Promise<AuthResult>;
  isLiked: (postId: string) => boolean;
  isReposted: (postId: string) => boolean;
  likeCount: (postId: string) => number;
  repostCount: (postId: string) => number;
  reposts: PostRepost[];
  commentsFor: (postId: string) => PostComment[];
  notifications: Notification[];
  unreadCount: number;
  markNotificationsRead: () => void;
  messages: DirectMessage[];
  unreadMessageCount: number;
  sendMessage: (receiverId: string, content: string) => Promise<AuthResult>;
  markThreadRead: (partnerId: string) => void;
  feed: TimelineItem[];
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
  messages: [],
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
  const likeQueue = useRef(Promise.resolve());
  const repostQueue = useRef(Promise.resolve());
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
      .then(() => {
        if (!cancelled) setStatus(null);
      })
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
        refreshRemote(client)
          .then(() => setStatus(null))
          .catch((error: unknown) => {
            setStatus(error instanceof Error ? error.message : "Could not reach Supabase.");
          });
      }, 0);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [refreshRemote]);

  useEffect(() => {
    if (mode !== "supabase" || !ready) return;
    const client = supabaseRef.current;
    if (!client) return;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        refreshRemote(client).catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : "Could not reach Supabase.");
        });
      }, 250);
    };
    const channel = client
      .channel("social-comments-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, schedule)
      .subscribe();
    const reposts = client
      .channel("social-reposts")
      .on("postgres_changes", { event: "*", schema: "public", table: "reposts" }, schedule)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void client.removeChannel(channel);
      void client.removeChannel(reposts);
    };
  }, [mode, ready, refreshRemote]);

  const baseSnapshot = mode === "local" && local ? snapshotFromLocal(local) : remote;
  const postIds = new Set(baseSnapshot.posts.map((post) => post.id));
  const snapshot =
    mode === "supabase"
      ? {
          ...baseSnapshot,
          likes: activity.likes,
          reposts: [
            ...baseSnapshot.reposts,
            ...activity.reposts.filter((repost) => !postIds.has(repost.postId)),
          ],
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
      messages: current.messages ?? [],
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
      const current = snapshotRef.current;
      if (!current.user || current.user.id === userId) return;
      const client = supabaseRef.current;
      if (mode === "supabase" && client) {
        const following = current.follows.some(
          (edge) => edge.followerId === current.user?.id && edge.followingId === userId,
        );
        try {
          const result = await remoteToggleFollow(client, current.user.id, userId, following);
          await refreshRemote(client);
          setStatus(result.error ?? result.notice ?? null);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not update that follow.");
        }
        return;
      }
      if (localRef.current) commitLocal(localToggleFollow(localRef.current, userId));
    },
    [commitLocal, mode, refreshRemote],
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
      const current = snapshotRef.current;
      if (!current.user) return;
      if (mode === "supabase") {
        const wasLiked = current.likes.some(
          (like) => like.postId === postId && like.userId === current.user?.id,
        );
        const post = current.posts.find((item) => item.id === postId);
        rememberActivity(localToggleLike(activityShell(), postId));
        const client = supabaseRef.current;
        if (!client || !post) return;
        const actorId = current.user.id;
        likeQueue.current = likeQueue.current
          .catch(() => undefined)
          .then(async () => {
            const result = await remoteSyncLikeNotification(client, {
              actorId,
              recipientId: post.authorId,
              postId,
              preview: post.body,
              liked: !wasLiked,
            });
            if (result.error) {
              setStatus(result.error);
              return;
            }
            await refreshRemote(client);
          });
        return;
      }
      if (!localRef.current) return;
      commitLocal(localToggleLike(localRef.current, postId));
    },
    [activityShell, commitLocal, mode, refreshRemote, rememberActivity],
  );

  const toggleRepost = useCallback(
    (postId: string) => {
      const current = snapshotRef.current;
      if (!current.user) return;
      if (mode === "supabase") {
        const client = supabaseRef.current;
        if (!client) return;
        const userId = current.user.id;
        const post = current.posts.find((item) => item.id === postId);
        if (!post) {
          rememberActivity(localToggleRepost(activityShell(), postId));
          return;
        }
        const reposted = current.reposts.some(
          (repost) => repost.postId === postId && repost.userId === userId,
        );
        const reposts = reposted
          ? current.reposts.filter((repost) => !(repost.postId === postId && repost.userId === userId))
          : [...current.reposts, { postId, userId, createdAt: new Date().toISOString() }];
        const knownPosts = new Set(current.posts.map((item) => item.id));
        snapshotRef.current = { ...current, reposts };
        setRemote((existing) => ({
          ...existing,
          reposts: reposts.filter((repost) => knownPosts.has(repost.postId)),
        }));
        repostQueue.current = repostQueue.current
          .catch(() => undefined)
          .then(async () => {
            const result = await remoteToggleRepost(client, {
              userId,
              postId,
              authorId: post.authorId,
              preview: post.body,
              reposted,
            });
            if (result.error || result.notice) setStatus(result.error ?? result.notice ?? null);
            await refreshRemote(client);
          })
          .catch((error: unknown) => {
            setStatus(error instanceof Error ? error.message : "Could not update that repost.");
            return refreshRemote(client).catch(() => undefined);
          });
        return;
      }
      if (!localRef.current) return;
      commitLocal(localToggleRepost(localRef.current, postId));
    },
    [activityShell, commitLocal, mode, refreshRemote, rememberActivity],
  );

  const addComment = useCallback(
    async (postId: string, body: string): Promise<AuthResult> => {
      if (mode === "supabase") {
        const client = supabaseRef.current;
        const current = snapshotRef.current;
        if (!client) return { error: "Still loading." };
        if (!current.user) return { error: "Log in to comment." };
        const post = current.posts.find((item) => item.id === postId);
        try {
          const result = await remoteAddComment(
            client,
            current.user.id,
            postId,
            body,
            post?.authorId ?? null,
          );
          if (!result.error) {
            await refreshRemote(client);
            if (result.notice) setStatus(result.notice);
          }
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not post that comment." };
        }
      }
      if (!localRef.current) return { error: "Still loading." };
      const result = localAddComment(localRef.current, postId, body);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode, refreshRemote],
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
    const current = snapshotRef.current;
    if (!current.user) return;
    const userId = current.user.id;
    if (!current.notifications.some((note) => note.recipientId === userId && !note.read)) return;
    if (mode === "supabase") {
      setRemote((existing) => ({
        ...existing,
        notifications: existing.notifications.map((note) =>
          note.recipientId === userId ? { ...note, read: true } : note,
        ),
      }));
      const client = supabaseRef.current;
      if (!client) return;
      void remoteMarkNotificationsRead(client, userId).then((result) => {
        if (result.error) setStatus(result.error);
      });
      return;
    }
    if (!localRef.current) return;
    commitLocal(localMarkNotificationsRead(localRef.current));
  }, [commitLocal, mode]);

  const messages = useMemo(() => {
    if (!snapshot.user) return [];
    const id = snapshot.user.id;
    return (snapshot.messages ?? [])
      .filter((message) => message.senderId === id || message.receiverId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [snapshot.messages, snapshot.user]);

  const unreadMessageCount = messages.filter(
    (message) => message.receiverId === snapshot.user?.id && !message.read,
  ).length;

  const sendMessage = useCallback(
    async (receiverId: string, content: string): Promise<AuthResult> => {
      if (mode === "supabase") {
        const client = supabaseRef.current;
        const current = snapshotRef.current;
        if (!client) return { error: "Still loading." };
        if (!current.user) return { error: "Log in to send a message." };
        try {
          const result = await remoteSendMessage(client, current.user.id, receiverId, content);
          if (!result.error) await refreshRemote(client);
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not send that message." };
        }
      }
      if (!localRef.current) return { error: "Still loading." };
      const result = localSendMessage(localRef.current, receiverId, content);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode, refreshRemote],
  );

  const markThreadRead = useCallback(
    (partnerId: string) => {
      const current = snapshotRef.current;
      if (!current.user) return;
      const userId = current.user.id;
      const hasUnread = (current.messages ?? []).some(
        (message) => message.senderId === partnerId && message.receiverId === userId && !message.read,
      );
      if (!hasUnread) return;
      if (mode === "supabase") {
        setRemote((existing) => ({
          ...existing,
          messages: (existing.messages ?? []).map((message) =>
            message.senderId === partnerId && message.receiverId === userId
              ? { ...message, read: true }
              : message,
          ),
        }));
        const client = supabaseRef.current;
        if (!client) return;
        void remoteMarkThreadRead(client, userId, partnerId).then((result) => {
          if (result.error) setStatus(result.error);
        });
        return;
      }
      if (!localRef.current) return;
      commitLocal(localMarkThreadRead(localRef.current, partnerId));
    },
    [commitLocal, mode],
  );

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

  const profilesById = useMemo(
    () => new Map(snapshot.profiles.map((profile) => [profile.id, profile])),
    [snapshot.profiles],
  );

  const followersOf = useCallback(
    (userId: string) =>
      snapshot.follows
        .filter((edge) => edge.followingId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .flatMap((edge) => {
          const profile = profilesById.get(edge.followerId);
          return profile ? [profile] : [];
        }),
    [profilesById, snapshot.follows],
  );

  const followingOf = useCallback(
    (userId: string) =>
      snapshot.follows
        .filter((edge) => edge.followerId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .flatMap((edge) => {
          const profile = profilesById.get(edge.followingId);
          return profile ? [profile] : [];
        }),
    [profilesById, snapshot.follows],
  );

  const feed = useMemo(() => {
    if (!snapshot.user) return [];
    return followingTimeline(
      snapshot.posts,
      snapshot.reposts,
      snapshot.profiles,
      snapshot.follows,
      snapshot.user.id,
    );
  }, [snapshot.follows, snapshot.posts, snapshot.profiles, snapshot.reposts, snapshot.user]);

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
      followersOf,
      followingOf,
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
      reposts: snapshot.reposts,
      commentsFor,
      notifications,
      unreadCount,
      markNotificationsRead,
      messages,
      unreadMessageCount,
      sendMessage,
      markThreadRead,
      feed,
      suggestions,
      profileByUsername,
    }),
    [
      addComment,
      commentsFor,
      markNotificationsRead,
      markThreadRead,
      messages,
      notifications,
      createPost,
      updatePost,
      deletePost,
      feed,
      followerCount,
      followersOf,
      followingOf,
      isLiked,
      isReposted,
      likeCount,
      repostCount,
      snapshot.reposts,
      followingCount,
      isFollowing,
      mode,
      profileByUsername,
      ready,
      refresh,
      signIn,
      signOut,
      sendMessage,
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
      unreadMessageCount,
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
