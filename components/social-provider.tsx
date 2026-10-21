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
import { usePathname } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trackEvent } from "@/lib/analytics";
import { activityFrom, emptyActivity, loadActivity, saveActivity, type ActivityStore } from "@/lib/social/activity";
import {
  createRememberedPosts,
  findKnownPost,
  forgetRememberedPost,
  mergeRememberedSnapshot,
  storeRemembered,
} from "@/lib/social/remembered-posts";
import {
  loadOrCreateLocalDb,
  localAddComment,
  canDeleteReply,
  localCreatePost,
  localDeleteComment,
  localDeletePost,
  stateAfterReplyDelete,
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
  remoteDeleteComment,
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
import {
  loadPostPage,
  mergePostPageIntoSnapshot,
  postPageId,
} from "@/lib/social/load-post-page";
import { isUuid } from "@/lib/value/card-value-access";
import { collectAttachedCardIds } from "@/lib/social/post-card-value";
import { followingTimeline, type TimelineItem } from "@/lib/social/timeline";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { getSupabaseConfig } from "@/lib/supabase/client";
import type { CardValueResult } from "@/lib/value/types";
import { useCardValues } from "@/lib/value/use-card-values";
import type {
  AuthResult,
  DirectMessage,
  FollowEdge,
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
  signIn: (email: string, password: string, captchaToken?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<AuthResult>;
  toggleFollow: (userId: string) => Promise<AuthResult>;
  isFollowing: (userId: string) => boolean;
  followerCount: (userId: string) => number;
  followingCount: (userId: string) => number;
  followersOf: (userId: string) => Profile[];
  followingOf: (userId: string) => Profile[];
  createPost: (input: {
    body: string;
    imageDataUrl: string | null;
    card: PublicCard | null;
    quotedPostId?: string | null;
  }) => Promise<AuthResult>;
  updatePost: (
    postId: string,
    input: { body: string; imageDataUrl: string | null },
  ) => Promise<AuthResult>;
  deletePost: (postId: string) => Promise<AuthResult>;
  deleteComment: (commentId: string) => Promise<AuthResult>;
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
  follows: FollowEdge[];
  /** Merge posts loaded by a paged feed so likes, quotes, and edits can see them. */
  rememberPosts: (posts: Post[], profiles?: Profile[]) => void;
  /** Snapshot posts plus posts remembered past the newest 100. */
  findPost: (postId: string) => Post | undefined;
  /** Posts deleted this session, hidden until the next full reload. */
  removedPostIds: ReadonlySet<string>;
  homePosts: Post[];
  homeReposts: PostRepost[];
  blockedIds: string[];
  mutedIds: string[];
  safetyAccounts: Profile[];
  applySafetyChange: (change: {
    type: "block" | "unblock" | "mute" | "unmute";
    userId: string;
  }) => void;
  suggestions: Profile[];
  profileByUsername: (username: string) => Profile | undefined;
  /** Trusted card_values for every card attached to a loaded post, one batch. */
  postCardValues: Map<string, CardValueResult>;
  postCardValuesLoading: boolean;
  /** Set when the home feed's price check is rate-limited. */
  postCardValuesMessage: string | null;
  /** True while /posts/[id] is fetching that post and not the home snapshot. */
  postLoading: boolean;
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
  const [removedPostIds, setRemovedPostIds] = useState<ReadonlySet<string>>(() => new Set());
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const localRef = useRef<LocalDb | null>(null);
  const likeQueue = useRef(Promise.resolve());
  const repostQueue = useRef(Promise.resolve());
  const rememberedRef = useRef(createRememberedPosts());
  const removedRef = useRef<ReadonlySet<string>>(new Set());
  const scopeRef = useRef<"full" | "post" | "empty">("empty");
  const loadedRouteRef = useRef<string | null>(null);
  const loadGen = useRef(0);
  const viewerIdRef = useRef<string | null>(null);
  /** Set when the badge was cleared before notification rows were loaded. */
  const markReadRef = useRef(false);
  const pathname = usePathname() || "/";
  const routePostId = postPageId(pathname);
  const routePostIdRef = useRef(routePostId);
  const [postLoadingId, setPostLoadingId] = useState<string | null>(null);
  localRef.current = local;

  useEffect(() => {
    routePostIdRef.current = routePostId;
  }, [routePostId]);

  useEffect(() => {
    removedRef.current = removedPostIds;
  }, [removedPostIds]);

  const refreshRemote = useCallback(async (client: SupabaseClient) => {
    const readPendingNotifications = (snapshot: SocialSnapshot) => {
      if (!markReadRef.current) return snapshot;
      markReadRef.current = false;
      const userId = snapshot.user?.id;
      if (!userId) return { ...snapshot, unreadNotificationCount: 0 };
      return {
        ...snapshot,
        unreadNotificationCount: 0,
        notifications: snapshot.notifications.map((note) =>
          note.recipientId === userId ? { ...note, read: true } : note,
        ),
      };
    };
    const postId = routePostIdRef.current;
    const gen = ++loadGen.current;
    if (postId) setPostLoadingId(postId);
    try {
      if (postId) {
        const page = await loadPostPage(client, postId);
        if (loadGen.current !== gen) return;
        const blocked = new Set(page.snapshot.blockedIds ?? []);
        if (page.found) {
          storeRemembered(
            rememberedRef.current,
            page.snapshot.posts,
            page.snapshot.profiles,
            blocked,
          );
        } else {
          forgetRememberedPost(rememberedRef.current, postId);
        }
        for (const removedId of removedRef.current) {
          forgetRememberedPost(rememberedRef.current, removedId);
        }
        const sameViewer = viewerIdRef.current === (page.snapshot.user?.id ?? null);
        const keepFull = scopeRef.current === "full" && sameViewer;
        setRemote((existing) => {
          const base = keepFull
            ? mergePostPageIntoSnapshot(existing, page.snapshot, postId)
            : page.snapshot;
          return mergeRememberedSnapshot(base, rememberedRef.current, removedRef.current);
        });
        if (!keepFull) scopeRef.current = "post";
      } else {
        const snapshot = await loadSupabaseSocial(client);
        if (loadGen.current !== gen) return;
        scopeRef.current = "full";
        setRemote(
          mergeRememberedSnapshot(
            readPendingNotifications(snapshot),
            rememberedRef.current,
            removedRef.current,
          ),
        );
      }
      if (loadGen.current === gen) loadedRouteRef.current = postId ?? "";
    } finally {
      if (loadGen.current === gen) setPostLoadingId(null);
    }
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
    const key = routePostId ?? "";
    if (loadedRouteRef.current === key) return;
    if (!routePostId && scopeRef.current === "full") return;
    refreshRemote(client).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Could not reach Supabase.");
    });
  }, [mode, ready, refreshRemote, routePostId]);

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
    const commentFilter = isUuid(routePostId ?? "")
      ? `post_id=eq.${routePostId}`
      : undefined;
    const repostFilter = commentFilter;
    const channel = client
      .channel("social-comments-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          ...(commentFilter ? { filter: commentFilter } : {}),
        },
        schedule,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, schedule)
      .subscribe();
    const reposts = client
      .channel("social-reposts")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reposts",
          ...(repostFilter ? { filter: repostFilter } : {}),
        },
        schedule,
      )
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void client.removeChannel(channel);
      void client.removeChannel(reposts);
    };
  }, [mode, ready, refreshRemote, routePostId]);

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

  useEffect(() => {
    viewerIdRef.current = snapshot.user?.id ?? null;
  }, [snapshot.user]);

  const postCardIdKey = useMemo(() => {
    const ids = collectAttachedCardIds(snapshot.posts);
    if (ids.length === 0) return "";
    return [...ids].sort().join(",");
  }, [snapshot.posts]);
  const postCardIds = useMemo(
    () => (postCardIdKey ? postCardIdKey.split(",") : []),
    [postCardIdKey],
  );
  const {
    values: postCardValues,
    loading: postCardValuesLoading,
    errorMessage: postCardValuesMessage,
  } = useCardValues(postCardIds);

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
    async (email: string, password: string, captchaToken?: string): Promise<AuthResult> => {
      const client = supabaseRef.current;
      if (mode === "supabase" && client) {
        try {
          const result = await remoteSignIn(client, email, password, captchaToken);
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
    async (userId: string): Promise<AuthResult> => {
      const current = snapshotRef.current;
      if (!current.user || current.user.id === userId) return {};
      const client = supabaseRef.current;
      if (mode === "supabase" && client) {
        const following = current.follows.some(
          (edge) => edge.followerId === current.user?.id && edge.followingId === userId,
        );
        try {
          const result = await remoteToggleFollow(client, current.user.id, userId, following);
          if (result.error) {
            setStatus(result.error);
            return result;
          }
          await refreshRemote(client);
          setStatus(result.notice ?? null);
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not update that follow.";
          setStatus(message);
          return { error: message };
        }
      }
      if (localRef.current) commitLocal(localToggleFollow(localRef.current, userId));
      return {};
    },
    [commitLocal, mode, refreshRemote],
  );

  const createPost = useCallback(
    async (input: {
      body: string;
      imageDataUrl: string | null;
      card: PublicCard | null;
      quotedPostId?: string | null;
    }): Promise<AuthResult> => {
      const client = supabaseRef.current;
      if (mode === "supabase" && client && snapshot.user) {
        try {
          const result = await remoteCreatePost(client, snapshot.user.id, input);
          if (!result.error) {
            trackEvent("post_created");
            await refreshRemote(client);
            if (result.notice) setStatus(result.notice);
          }
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not publish that post." };
        }
      }
      const current = localRef.current;
      if (!current) return { error: "Still loading." };
      const result = localCreatePost(current, input);
      if (!result.error) {
        commitLocal(result.db);
        trackEvent("post_created");
      }
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
          if (!result.error) {
            const known = findKnownPost(
              snapshotRef.current.posts,
              rememberedRef.current,
              postId,
            );
            if (known) {
              storeRemembered(
                rememberedRef.current,
                [{ ...known, body: input.body, imageDataUrl: input.imageDataUrl }],
                [],
                new Set(snapshotRef.current.blockedIds ?? []),
              );
            }
            await refreshRemote(client);
            if (result.notice) setStatus(result.notice);
          }
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
            forgetRememberedPost(rememberedRef.current, postId);
            const removed = new Set(removedRef.current);
            removed.add(postId);
            removedRef.current = removed;
            setRemovedPostIds(removed);
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

  const deleteComment = useCallback(
    async (commentId: string): Promise<AuthResult> => {
      const current = snapshotRef.current;
      if (!current.user) return { error: "Log in to delete." };

      const before = {
        comments: current.comments,
        likes: current.likes,
        reposts: current.reposts,
        notifications: current.notifications,
      };

      if (mode === "supabase") {
        const client = supabaseRef.current;
        if (!client) return { error: "Still loading." };
        const comment = before.comments.find((item) => item.id === commentId);
        if (!comment) return { error: "That reply is gone." };
        if (!canDeleteReply(current.user.id, comment.authorId)) {
          return { error: "You can only delete your own replies." };
        }
        const shell = activityShell();
        const publish = (patch: typeof before) => {
          setRemote((existing) => ({
            ...existing,
            comments: patch.comments,
            notifications: patch.notifications,
          }));
          rememberActivity({
            ...shell,
            likes: patch.likes,
            reposts: patch.reposts,
            comments: patch.comments,
            notifications: patch.notifications,
          });
        };
        publish(stateAfterReplyDelete(before, commentId, {}));
        try {
          const result = await remoteDeleteComment(client, current.user.id, commentId);
          publish(stateAfterReplyDelete(before, commentId, result));
          if (result.error) return result;
          try {
            await refreshRemote(client);
          } catch {
            // The reply is already deleted. Keep it off the screen.
          }
          return {};
        } catch (error) {
          const failed = {
            error: error instanceof Error ? error.message : "Could not delete that reply.",
          };
          publish(stateAfterReplyDelete(before, commentId, failed));
          return failed;
        }
      }

      const db = localRef.current;
      if (!db) return { error: "Still loading." };
      const result = localDeleteComment(db, commentId);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [activityShell, commitLocal, mode, refreshRemote, rememberActivity],
  );

  const toggleLike = useCallback(
    (postId: string) => {
      const current = snapshotRef.current;
      if (!current.user) return;
      if (mode === "supabase") {
        const wasLiked = current.likes.some(
          (like) => like.postId === postId && like.userId === current.user?.id,
        );
        const post = findKnownPost(current.posts, rememberedRef.current, postId, {
          removedIds: removedRef.current,
          blockedIds: new Set(current.blockedIds ?? []),
        });
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
        const post = findKnownPost(current.posts, rememberedRef.current, postId, {
          removedIds: removedRef.current,
          blockedIds: new Set(current.blockedIds ?? []),
        });
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
        const post = findKnownPost(current.posts, rememberedRef.current, postId, {
          removedIds: removedRef.current,
          blockedIds: new Set(current.blockedIds ?? []),
        });
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

  const unreadCount =
    snapshot.unreadNotificationCount != null && snapshot.notifications.length === 0
      ? snapshot.unreadNotificationCount
      : notifications.filter((note) => !note.read).length;

  const markNotificationsRead = useCallback(() => {
    const current = snapshotRef.current;
    if (!current.user) return;
    const userId = current.user.id;
    const hasUnreadRow = current.notifications.some(
      (note) => note.recipientId === userId && !note.read,
    );
    const hasUnreadCount =
      current.notifications.length === 0 && (current.unreadNotificationCount ?? 0) > 0;
    if (!hasUnreadRow && !hasUnreadCount) return;
    if (mode === "supabase") {
      if (hasUnreadCount) markReadRef.current = true;
      setRemote((existing) => ({
        ...existing,
        unreadNotificationCount: 0,
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

  const listedUnreadMessages = messages.filter(
    (message) => message.receiverId === snapshot.user?.id && !message.read,
  ).length;
  const unreadMessageCount =
    snapshot.unreadMessageCount != null && (snapshot.messages ?? []).length === 0
      ? snapshot.unreadMessageCount
      : listedUnreadMessages;

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

  const rememberPosts = useCallback((posts: Post[], profiles: Profile[] = []) => {
    if (posts.length === 0 && profiles.length === 0) return;
    const blocked = new Set(snapshotRef.current.blockedIds ?? []);
    storeRemembered(rememberedRef.current, posts, profiles, blocked);
    for (const postId of removedRef.current) forgetRememberedPost(rememberedRef.current, postId);
    setRemote((existing) =>
      mergeRememberedSnapshot(existing, rememberedRef.current, removedRef.current),
    );
  }, []);

  const findPost = useCallback(
    (postId: string) =>
      findKnownPost(snapshotRef.current.posts, rememberedRef.current, postId, {
        removedIds: removedRef.current,
        blockedIds: new Set(snapshotRef.current.blockedIds ?? []),
      }),
    [],
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

  const homePosts = snapshot.homePosts ?? snapshot.posts;
  const homeReposts = snapshot.homeReposts ?? snapshot.reposts;
  const blockedIds = snapshot.blockedIds ?? [];
  const mutedIds = snapshot.mutedIds ?? [];
  const safetyAccounts = snapshot.safetyAccounts ?? [];

  const applySafetyChange = useCallback(
    (change: { type: "block" | "unblock" | "mute" | "unmute"; userId: string }) => {
      setRemote((existing) => {
        const blocked = new Set(existing.blockedIds ?? []);
        const muted = new Set(existing.mutedIds ?? []);
        if (change.type === "block") blocked.add(change.userId);
        if (change.type === "unblock") blocked.delete(change.userId);
        if (change.type === "mute") muted.add(change.userId);
        if (change.type === "unmute") muted.delete(change.userId);
        const me = existing.user?.id;
        const person =
          existing.profiles.find((profile) => profile.id === change.userId) ??
          existing.safetyAccounts?.find((profile) => profile.id === change.userId);
        const accounts = new Map(
          (existing.safetyAccounts ?? []).map((profile) => [profile.id, profile]),
        );
        if (person && (change.type === "block" || change.type === "mute")) {
          accounts.set(person.id, person);
        }
        if (change.type === "unblock" || change.type === "unmute") {
          const still = blocked.has(change.userId) || muted.has(change.userId);
          if (!still) accounts.delete(change.userId);
        }
        return {
          ...existing,
          blockedIds: [...blocked],
          mutedIds: [...muted],
          safetyAccounts: [...accounts.values()],
          profiles: existing.profiles.filter((profile) => !blocked.has(profile.id)),
          posts: existing.posts.filter((post) => !blocked.has(post.authorId)),
          homePosts: (existing.homePosts ?? existing.posts).filter(
            (post) => !blocked.has(post.authorId) && !muted.has(post.authorId),
          ),
          homeReposts: (existing.homeReposts ?? existing.reposts).filter(
            (repost) => !blocked.has(repost.userId) && !muted.has(repost.userId),
          ),
          reposts: existing.reposts.filter((repost) => !blocked.has(repost.userId)),
          comments: existing.comments.filter(
            (comment) => !blocked.has(comment.authorId) && !muted.has(comment.authorId),
          ),
          notifications: existing.notifications.filter(
            (note) => !note.actorId || (!blocked.has(note.actorId) && !muted.has(note.actorId)),
          ),
          follows:
            change.type === "block" && me
              ? existing.follows.filter((edge) => {
                  const pair =
                    (edge.followerId === me && edge.followingId === change.userId) ||
                    (edge.followerId === change.userId && edge.followingId === me);
                  return !pair;
                })
              : existing.follows,
        };
      });
    },
    [],
  );

  const feed = useMemo(() => {
    if (!snapshot.user) return [];
    return followingTimeline(
      homePosts,
      homeReposts,
      snapshot.profiles,
      snapshot.follows,
      snapshot.user.id,
    );
  }, [homePosts, homeReposts, snapshot.follows, snapshot.profiles, snapshot.user]);

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
      deleteComment,
      toggleLike,
      toggleRepost,
      addComment,
      isLiked,
      isReposted,
      likeCount,
      repostCount,
      reposts: snapshot.reposts,
      homePosts,
      homeReposts,
      blockedIds,
      mutedIds,
      safetyAccounts,
      applySafetyChange,
      commentsFor,
      notifications,
      unreadCount,
      markNotificationsRead,
      messages,
      unreadMessageCount,
      sendMessage,
      markThreadRead,
      feed,
      follows: snapshot.follows,
      rememberPosts,
      findPost,
      removedPostIds,
      suggestions,
      profileByUsername,
      postCardValues,
      postCardValuesLoading,
      postCardValuesMessage,
      postLoading: postLoadingId !== null,
    }),
    [
      addComment,
      applySafetyChange,
      blockedIds,
      commentsFor,
      markNotificationsRead,
      markThreadRead,
      messages,
      notifications,
      createPost,
      updatePost,
      deleteComment,
      deletePost,
      feed,
      snapshot.follows,
      rememberPosts,
      findPost,
      removedPostIds,
      followerCount,
      followersOf,
      followingOf,
      isLiked,
      isReposted,
      likeCount,
      repostCount,
      snapshot.reposts,
      followingCount,
      homePosts,
      homeReposts,
      isFollowing,
      mode,
      mutedIds,
      profileByUsername,
      postCardValues,
      postCardValuesLoading,
      postCardValuesMessage,
      postLoadingId,
      ready,
      refresh,
      signIn,
      signOut,
      safetyAccounts,
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
