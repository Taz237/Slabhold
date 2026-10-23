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
import { clearNewCardDraft } from "@/lib/cards/new-card-draft";
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
  localPinPost,
  localUnpinPost,
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
  loadInboxPage,
  loadThreadPage,
  remoteAddComment,
  remoteCreatePost,
  remoteDeleteComment,
  remoteDeletePost,
  remotePinPost,
  remoteUnpinPost,
  remoteMarkNotificationsRead,
  remoteMarkThreadRead,
  remoteSendMessage,
  remoteSignIn,
  remoteSignOut,
  remoteSignUp,
  remoteSyncLikeNotification,
  remoteToggleFollow,
  remoteFollowAll,
  remoteToggleRepost,
  remoteUpdatePost,
  remoteUpdateProfile,
} from "@/lib/social/remote";
import { type PageCursor } from "@/lib/social/page-cursor";
import {
  appendFollowList,
  appendOwnerCards,
  applyViewerShell,
  loadFollowList,
  loadNotificationPage,
  loadOwnerCardPage,
  loadProfileSlice,
  loadSearchSlice,
  loadShellBundle,
  loadUnreadCounts,
  loadMessagePartners,
  mergeFollowList,
  mergePosts,
  mergeProfiles,
  replaceOwnerCards,
  socialRoute,
  type ShellBundle,
  type UnreadCounts,
} from "@/lib/social/scoped-reads";
import {
  countsFromEdges,
  dropById,
  followManyLocal,
  insertFirst,
  pendingComment,
  pendingMessage,
  pendingPost,
  replaceId,
  toggleFollowLocal,
  toggleRepostLocal,
  type FollowCountMap,
} from "@/lib/social/optimistic-patch";
import { offerSendError, parseCardPreview } from "@/lib/offers/open-to-offers";
import { authSnapshotReload } from "@/lib/social/auth-snapshot";
import { loadPostById, loadPostPage, type LoadedPostPage } from "@/lib/social/load-feed-page";
import { loadRealtimePatch } from "@/lib/social/realtime-slices";
import {
  applyRealtimePatch,
  createRealtimeScheduler,
  REALTIME_DEBOUNCE_MS,
  realtimeBindings,
  shouldFetchPublicCatalog,
} from "@/lib/social/realtime-sync";
import { createSnapshotRefresher } from "@/lib/social/snapshot-refresh";
import { postIdFromPath } from "@/lib/social/post-route";
import { collectAttachedCardIds } from "@/lib/social/post-card-value";
import {
  followSuggestionFetchLimit,
  followSuggestions,
} from "@/lib/social/follow-suggestions";
import { loadServerSuggestions } from "@/lib/social/load-suggestions";
import {
  followAllIds,
  mergeRankedSuggestions,
  type ServerSuggestion,
  type SuggestedProfile,
} from "@/lib/social/suggestion-order";
import { unreadGroupCount } from "@/lib/social/group-notifications";
import { followingTimeline, type TimelineItem } from "@/lib/social/timeline";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { getSupabaseConfig } from "@/lib/supabase/client";
import type { CardValueResult } from "@/lib/value/types";
import { useCardValues } from "@/lib/value/use-card-values";
import type {
  AuthResult,
  CardMessagePreview,
  DirectMessage,
  FollowEdge,
  Notification,
  Post,
  PostComment,
  PostRepost,
  Profile,
  ProfilePatch,
  SignUpInput,
  SocialSnapshot,
} from "@/lib/social/types";
import { draftPostPhotos, type PostWrite } from "@/lib/social/post-photos";
import { profileReplies, profileWithPin } from "@/lib/social/profile-tabs";
import { shouldSkipSocialSnapshot, withSessionTimeout } from "@/lib/auth/shell-paint";

type SocialContextValue = {
  ready: boolean;
  /** True after the local session read finishes. The shell does not wait on the snapshot. */
  sessionKnown: boolean;
  /** Auth user id from getSession, before the profile row is loaded. */
  sessionUserId: string | null;
  /** True after the site snapshot is in memory. A cold post page leaves this false. */
  hasFullSnapshot: boolean;
  /** Set while a post screen is fetching a post that is not in memory yet. */
  loadingPostId: string | null;
  mode: "local" | "supabase";
  user: Profile | null;
  profiles: Profile[];
  posts: Post[];
  publicCards: SocialSnapshot["publicCards"];
  status: string | null;
  refresh: () => Promise<Notification[]>;
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
  createPost: (input: PostWrite) => Promise<AuthResult & { postId?: string }>;
  updatePost: (
    postId: string,
    input: { body: string; imageDataUrl: string | null; images?: readonly string[] | null },
  ) => Promise<AuthResult>;
  deletePost: (postId: string) => Promise<AuthResult>;
  pinPost: (postId: string) => Promise<AuthResult>;
  unpinPost: () => Promise<AuthResult>;
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
  repliesBy: (userId: string) => ReturnType<typeof profileReplies>;
  notifications: Notification[];
  unreadCount: number;
  notificationsHasMore: boolean;
  loadMoreNotifications: () => Promise<void>;
  markNotificationsRead: (ids?: readonly string[]) => void;
  messages: DirectMessage[];
  unreadMessageCount: number;
  messagesHasMore: boolean;
  loadMoreMessages: () => Promise<void>;
  threadHasMore: boolean;
  loadMoreThread: () => Promise<void>;
  followsHasMore: boolean;
  loadMoreFollows: () => Promise<void>;
  cardsHasMore: boolean;
  loadMoreCards: () => Promise<void>;
  /** Hidden authors from the shell batch. Null until that batch finishes for a signed-in viewer. */
  homeHiddenAuthorIds: readonly string[] | null;
  sendMessage: (
    receiverId: string,
    content: string,
    preview?: CardMessagePreview | null,
  ) => Promise<AuthResult>;
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
  /** hidden_author_ids for this viewer. Not "missing from profiles". */
  hiddenAuthorIds: string[];
  mutedIds: string[];
  safetyAccounts: Profile[];
  applySafetyChange: (change: {
    type: "block" | "unblock" | "mute" | "unmute";
    userId: string;
  }) => void;
  suggestions: SuggestedProfile[];
  suggestionsReady: boolean;
  refreshSuggestions: () => void;
  followMany: (userIds: readonly string[]) => Promise<AuthResult>;
  profileByUsername: (username: string) => Profile | undefined;
  /** Trusted card_values for every card attached to a loaded post, one batch. */
  postCardValues: Map<string, CardValueResult>;
  postCardValuesLoading: boolean;
  /** Set when the home feed's price check is rate-limited. */
  postCardValuesMessage: string | null;
};

export const SocialContext = createContext<SocialContextValue | null>(null);

/** Share one in-flight read across a strict-mode remount of the same route. */
function loadOnce<T>(
  inflight: Map<string, Promise<unknown>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const task = load();
  inflight.set(key, task);
  void task.finally(() => {
    if (inflight.get(key) === task) inflight.delete(key);
  });
  return task;
}

function mergeById<T extends { id: string }>(current: readonly T[], page: readonly T[]): T[] {
  const seen = new Set(current.map((item) => item.id));
  const extra = page.filter((item) => !seen.has(item.id));
  return extra.length === 0 ? [...current] : [...current, ...extra];
}

function notificationsFor(user: { id: string } | null, notes: Notification[]): Notification[] {
  if (!user) return [];
  return notes
    .filter((note) => note.recipientId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

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
  const pathname = usePathname() || "/";
  const [ready, setReady] = useState(false);
  const [sessionKnown, setSessionKnown] = useState(false);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [loadingPostId, setLoadingPostId] = useState<string | null>(null);
  const [resolvedPostId, setResolvedPostId] = useState<string | null>(null);
  const [hasFullSnapshot, setHasFullSnapshot] = useState(false);
  const [snapshotError, setSnapshotError] = useState(false);
  const [mode, setMode] = useState<"local" | "supabase">("local");
  const [local, setLocal] = useState<LocalDb | null>(null);
  const [remote, setRemote] = useState<SocialSnapshot>(emptySnapshot);
  const [status, setStatus] = useState<string | null>(null);
  const [suggestionResult, setSuggestionResult] = useState<{
    key: string;
    rows: ServerSuggestion[] | null;
  } | null>(null);
  const [suggestionEpoch, setSuggestionEpoch] = useState(0);
  const [activity, setActivity] = useState<ActivityStore>(emptyActivity);
  const [removedPostIds, setRemovedPostIds] = useState<ReadonlySet<string>>(() => new Set());
  const [followCounts, setFollowCounts] = useState<FollowCountMap>({});
  const followCountsRef = useRef<FollowCountMap>({});
  const [inboxUnread, setInboxUnread] = useState<UnreadCounts>({ notifications: 0, messages: 0 });
  const [homeHiddenAuthorIds, setHomeHiddenAuthorIds] = useState<readonly string[] | null>(null);
  const [notificationsHasMore, setNotificationsHasMore] = useState(false);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [threadHasMore, setThreadHasMore] = useState(false);
  const [followsHasMore, setFollowsHasMore] = useState(false);
  const [cardsHasMore, setCardsHasMore] = useState(false);
  const notificationCursorRef = useRef<PageCursor | null>(null);
  const messageCursorRef = useRef<PageCursor | null>(null);
  const threadCursorRef = useRef<PageCursor | null>(null);
  const threadPartnerRef = useRef<string | null>(null);
  const followCursorRef = useRef<PageCursor | null>(null);
  const followListRef = useRef<{ direction: "followers" | "following"; username: string | null } | null>(null);
  const cardCursorRef = useRef<PageCursor | null>(null);
  const cardOwnerRef = useRef<string | null>(null);
  const pagingLock = useRef(new Set<string>());
  const refreshUnreadRef = useRef<() => void>(() => {});
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const localRef = useRef<LocalDb | null>(null);
  const likeQueue = useRef(Promise.resolve());
  const repostQueue = useRef(Promise.resolve());
  const rememberedRef = useRef(createRememberedPosts());
  const removedRef = useRef<ReadonlySet<string>>(new Set());
  const fullSnapshotRef = useRef(false);
  const snapshotErrorRef = useRef(false);
  const requestRef = useRef(0);
  const snapshotRefreshRef = useRef(createSnapshotRefresher<ShellBundle>());
  const appliedRemoteRef = useRef<SocialSnapshot | null>(null);
  const inflightRef = useRef(new Map<string, Promise<unknown>>());
  const reloadRef = useRef<(client: SupabaseClient) => Promise<void>>(async () => {});
  const lastUserIdRef = useRef<string | null>(null);
  const sessionKnownRef = useRef(false);
  localRef.current = local;

  useEffect(() => {
    sessionKnownRef.current = sessionKnown;
  }, [sessionKnown]);

  const routePostId = postIdFromPath(pathname);
  const routePostKnown =
    routePostId !== null && remote.posts.some((post) => post.id === routePostId);
  if (
    mode === "supabase" &&
    !routePostId && !hasFullSnapshot && !snapshotError && ready &&
    !shouldSkipSocialSnapshot({ pathname, sessionKnown, sessionUserId })
  ) {
    setReady(false);
  }
  if (resolvedPostId && resolvedPostId !== routePostId) {
    setResolvedPostId(null);
  }
  if (
    mode === "supabase" &&
    routePostId &&
    !routePostKnown &&
    loadingPostId !== routePostId &&
    resolvedPostId !== routePostId
  ) {
    setLoadingPostId(routePostId);
  }

  useEffect(() => {
    removedRef.current = removedPostIds;
  }, [removedPostIds]);

  useEffect(() => {
    followCountsRef.current = followCounts;
  }, [followCounts]);

  const refreshRemote = useCallback(async (client: SupabaseClient) => {
    await snapshotRefreshRef.current(
      () => loadShellBundle(client),
      (bundle) => {
        const shell = bundle.shell;
        if (snapshotErrorRef.current) setStatus(null);
        snapshotErrorRef.current = false;
        setSnapshotError(false);
        fullSnapshotRef.current = true;
        setHasFullSnapshot(true);
        setInboxUnread(bundle.unread);
        setHomeHiddenAuthorIds(shell.user ? bundle.hiddenAuthorIds : null);
        setRemote((existing) => {
          const switched = !shell.user || Boolean(existing.user && shell.user && existing.user.id !== shell.user.id);
          if (switched) rememberedRef.current = createRememberedPosts();
          const next = switched ? shell : applyViewerShell(existing, shell);
          const merged = shell.user
            ? mergeRememberedSnapshot(next, rememberedRef.current, removedRef.current)
            : next;
          appliedRemoteRef.current = merged;
          return merged;
        });
        if (shell.user) {
          const seeded = countsFromEdges(shell.follows, shell.user.id);
          setFollowCounts((current) => ({ ...current, [shell.user!.id]: current[shell.user!.id] ?? seeded }));
        } else {
          setFollowCounts({});
          setNotificationsHasMore(false);
          setMessagesHasMore(false);
          setThreadHasMore(false);
          setFollowsHasMore(false);
          setCardsHasMore(false);
        }
        if (!postIdFromPath(window.location.pathname)) setReady(true);
      },
    );
  }, []);

  const applyPostPage = useCallback((page: LoadedPostPage) => {
    const posts: Post[] = [];
    const seen = new Set<string>();
    for (const post of [page.post, ...page.relatedPosts, ...page.quotingPosts]) {
      if (!post || seen.has(post.id)) continue;
      seen.add(post.id);
      posts.push(post);
    }
    const blocked = new Set(page.blockedIds);
    storeRemembered(rememberedRef.current, posts, page.profiles, blocked);
    for (const removedId of removedRef.current) forgetRememberedPost(rememberedRef.current, removedId);
    setRemote((existing) => {
      if (fullSnapshotRef.current) {
        return mergeRememberedSnapshot(existing, rememberedRef.current, removedRef.current);
      }
      return {
        user: page.user,
        profiles: page.profiles,
        posts,
        follows: [],
        likes: [],
        reposts: page.reposts,
        comments: page.comments,
        notifications: page.notifications,
        messages: page.messages,
        publicCards: [],
        homePosts: [],
        homeReposts: [],
        blockedIds: page.blockedIds,
        mutedIds: page.mutedIds,
        safetyAccounts: [],
      };
    });
  }, []);

  useEffect(() => {
    reloadRef.current = async (client) => {
      const path = window.location.pathname;
      if (
        shouldSkipSocialSnapshot({
          pathname: path,
          sessionKnown: sessionKnownRef.current,
          sessionUserId: lastUserIdRef.current,
        })
      ) {
        fullSnapshotRef.current = false;
        setHasFullSnapshot(false);
        setRemote(emptySnapshot);
        setReady(true);
        return;
      }
      const id = postIdFromPath(path);
      if (id && !fullSnapshotRef.current) {
        const page = await loadPostPage(client, id);
        applyPostPage(page);
        return;
      }
      await refreshRemote(client);
    };
  }, [applyPostPage, refreshRemote]);

  useEffect(() => {
    let cancelled = false;
    const client = createSupabaseBrowser();
    setActivity(loadActivity());
    if (!client) {
      const { issue } = getSupabaseConfig();
      if (issue) setStatus(issue);
      setSessionKnown(true);
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
    // INITIAL_SESSION would repeat the first load. Sign-in and sign-out still refresh.
    // SIGNED_IN also fires on load and whenever a tab becomes visible. Remember the
    // session user first so those repeats do not reload public_cards.
    let unsubscribe = () => {};
    let listenAttached = false;
    let sessionApplied = false;
    const reloadSession = () => {
      void reloadRef
        .current(client)
        .then(() => setStatus(null))
        .catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : "Could not reach Supabase.");
        });
    };
    const applySession = (id: string | null) => {
      const changed = sessionApplied && lastUserIdRef.current !== id;
      sessionApplied = true;
      lastUserIdRef.current = id;
      setSessionUserId(id);
      setSessionKnown(true);
      return changed;
    };
    const attachListener = () => {
      if (cancelled || listenAttached) return;
      listenAttached = true;
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
        const decision = authSnapshotReload({
          event,
          nextUserId: session?.user?.id ?? null,
          lastUserId: lastUserIdRef.current,
        });
        lastUserIdRef.current = decision.lastUserId;
        setSessionUserId(decision.lastUserId);
        if (!decision.reload) return;
        setTimeout(() => reloadSession(), 0);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    };
    const readSession = client.auth.getSession();
    void withSessionTimeout(readSession).then((timed) => {
      if (cancelled) return;
      if (!timed) {
        applySession(null);
        attachListener();
        void readSession
          .then(({ data: sessionData }) => {
            if (cancelled) return;
            const id = sessionData.session?.user?.id ?? null;
            if (!applySession(id)) return;
            reloadSession();
          })
          .catch(() => {
            // The timeout already painted the guest shell.
          });
        return;
      }
      applySession(timed.data.session?.user?.id ?? null);
      attachListener();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (mode !== "supabase" || !ready) return;
    const client = supabaseRef.current;
    if (!client) return;
    const postId = postIdFromPath(pathname);
    const viewerId = remote.user?.id ?? null;
    const bindings = realtimeBindings({
      viewerId,
      postId,
      fullSnapshot: fullSnapshotRef.current,
    });
    if (bindings.length === 0) return;

    let cancelled = false;
    const fail = (error: unknown) => {
      if (cancelled) return;
      setStatus(error instanceof Error ? error.message : "Could not reach Supabase.");
    };
    const scheduler = createRealtimeScheduler({
      debounceMs: REALTIME_DEBOUNCE_MS,
      hidden: () => document.hidden,
      reload: (slices) => {
        if (slices.has("notifications") || slices.has("messages")) refreshUnreadRef.current();
        const currentPost = postIdFromPath(window.location.pathname);
        // A cold post screen still reloads that post only. The site snapshot,
        // including public_cards, stays out of this path.
        if (!fullSnapshotRef.current && currentPost) {
          void loadPostPage(client, currentPost)
            .then((page) => {
              if (!cancelled) applyPostPage(page);
            })
            .catch(fail);
          return;
        }
        void loadRealtimePatch(client, slices, { viewerId, postId: currentPost })
          .then((patch) => {
            if (cancelled) return;
            setRemote((existing) => applyRealtimePatch(existing, patch));
          })
          .catch(fail);
      },
      schedule: (fn, ms) => window.setTimeout(fn, ms),
      cancel: (id) => window.clearTimeout(id),
    });

    const channel = client.channel(postId ? `post-${postId}` : "social-inbox");
    for (const binding of bindings) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: binding.table,
          filter: binding.filter,
        },
        () => scheduler.onEvent(binding.slice),
      );
    }
    channel.subscribe();

    const onVisibility = () => {
      if (!document.hidden) scheduler.onVisible();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      scheduler.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
      void client.removeChannel(channel);
    };
  }, [applyPostPage, hasFullSnapshot, mode, pathname, ready, remote.user?.id]);

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

  const refreshUnread = useCallback(() => {
    const client = supabaseRef.current;
    const viewerId = snapshotRef.current.user?.id;
    if (mode !== "supabase" || !client || !viewerId) return;
    void loadUnreadCounts(client, viewerId)
      .then((counts) => setInboxUnread(counts))
      .catch(() => undefined);
  }, [mode]);

  useEffect(() => {
    refreshUnreadRef.current = refreshUnread;
  }, [refreshUnread]);

  useEffect(() => {
    if (mode !== "supabase" || !ready || !remote.user?.id) return;
    const onFocus = () => {
      if (document.hidden) return;
      refreshUnreadRef.current();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [mode, ready, remote.user?.id]);

  const suggestionUserId = snapshot.user?.id ?? null;
  const seenDraftUserId = useRef(suggestionUserId);
  useEffect(() => {
    if (seenDraftUserId.current === suggestionUserId) return;
    seenDraftUserId.current = suggestionUserId;
    clearNewCardDraft();
  }, [suggestionUserId]);
  // Once per signed-in session, plus an explicit refresh after picks change.
  // Toggling provider readiness must not call the RPC again.
  const suggestionKey = `${mode}:${suggestionUserId ?? ""}:${suggestionEpoch}`;

  useEffect(() => {
    if (mode !== "supabase" || !suggestionUserId) return;
    const client = supabaseRef.current;
    if (!client) return;
    let cancelled = false;
    const key = suggestionKey;
    void loadServerSuggestions(client).then((rows) => {
      if (!cancelled) setSuggestionResult({ key, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [mode, suggestionEpoch, suggestionKey, suggestionUserId]);

  const suggestionsReady =
    mode !== "supabase" || !suggestionUserId || suggestionResult?.key === suggestionKey;
  const rankedRows =
    mode === "supabase" && suggestionUserId && suggestionResult?.key === suggestionKey
      ? suggestionResult.rows
      : null;

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

  const refresh = useCallback(async (): Promise<Notification[]> => {
    const client = supabaseRef.current;
    if (mode === "supabase" && client) {
      const path = typeof window === "undefined" ? "/" : window.location.pathname;
      const search = typeof window === "undefined" ? "" : window.location.search;
      const route = socialRoute(path);
      const current = snapshotRef.current;
      const viewer = current.user;
      const viewerId = viewer?.id ?? null;
      const publish = (patch: (existing: SocialSnapshot) => SocialSnapshot) => {
        setRemote((existing) => {
          const next = patch(existing);
          appliedRemoteRef.current = next;
          return next;
        });
      };
      if (route.kind === "notifications" && viewerId) {
        const page = await loadNotificationPage(client, viewerId, null);
        notificationCursorRef.current = page.cursor;
        setNotificationsHasMore(page.hasMore);
        publish((existing) => ({
          ...existing,
          notifications: page.notifications,
          profiles: mergeProfiles(existing.profiles, page.profiles),
        }));
        snapshotRef.current = {
          ...current,
          notifications: page.notifications,
          profiles: mergeProfiles(current.profiles, page.profiles),
        };
        return notificationsFor(viewer, page.notifications);
      }
      if (route.kind === "messages" && viewerId) {
        if (route.username) {
          const people = await loadMessagePartners(client, viewerId, [], route.username);
          const partner = people.find(
            (person) => person.username.toLowerCase() === route.username?.toLowerCase(),
          );
          if (partner) {
            const page = await loadThreadPage(client, viewerId, partner.id, null);
            if (page.error) throw new Error(page.error);
            threadCursorRef.current = page.cursor;
            threadPartnerRef.current = partner.id;
            setThreadHasMore(page.hasMore);
            publish((existing) => ({
              ...existing,
              messages: mergeById(existing.messages ?? [], page.messages),
              profiles: mergeProfiles(existing.profiles, people),
            }));
            return notificationsFor(viewer, current.notifications);
          }
        }
        const page = await loadInboxPage(client, viewerId, null);
        if (page.error) throw new Error(page.error);
        const people = await loadMessagePartners(client, viewerId, page.messages, route.username);
        messageCursorRef.current = page.cursor;
        setMessagesHasMore(page.hasMore);
        publish((existing) => ({
          ...existing,
          messages: page.messages,
          profiles: mergeProfiles(existing.profiles, people),
        }));
        return notificationsFor(viewer, current.notifications);
      }
      if ((route.kind === "followers" || route.kind === "following") && (viewer || route.username)) {
        const page = await loadFollowList(client, {
          direction: route.kind,
          username: route.username,
          viewer,
          cursor: null,
        });
        if (page.profile) {
          const profile = page.profile;
          followCursorRef.current = page.cursor;
          followListRef.current = { direction: route.kind, username: route.username };
          setFollowsHasMore(page.hasMore);
          publish((existing) => ({
            ...existing,
            profiles: mergeProfiles(existing.profiles, [profile, ...page.profiles]),
            follows: mergeFollowList(existing.follows, page.follows, profile.id, route.kind),
          }));
          return notificationsFor(viewer, current.notifications);
        }
      }
      if (route.kind === "profile") {
        const slice = await loadProfileSlice(client, { username: route.username, viewerId, viewer });
        if (slice.profile) {
          const profile = slice.profile;
          cardCursorRef.current = slice.cardsCursor;
          cardOwnerRef.current = profile.id;
          setCardsHasMore(slice.cardsHasMore);
          setFollowCounts((counts) => ({ ...counts, [profile.id]: slice.counts }));
          publish((existing) => ({
            ...existing,
            profiles: mergeProfiles(existing.profiles, [profile]),
            publicCards: replaceOwnerCards(existing.publicCards, profile.id, slice.cards),
            user:
              existing.user && profile.id === existing.user.id
                ? { ...existing.user, ...profile, email: existing.user.email }
                : existing.user,
          }));
          return notificationsFor(viewer, current.notifications);
        }
      }
      if (route.kind === "search") {
        const term = new URLSearchParams(search).get("q") ?? "";
        if (term.trim()) {
          const found = await loadSearchSlice(client, term, viewerId);
          publish((existing) => ({
            ...existing,
            profiles: mergeProfiles(existing.profiles, found.profiles),
            posts: mergePosts(existing.posts, found.posts),
            homePosts: mergePosts(existing.homePosts ?? existing.posts, found.posts),
          }));
        }
        return notificationsFor(viewer, current.notifications);
      }
      if (route.kind === "home") {
        return notificationsFor(current.user, current.notifications);
      }
      await refreshRemote(client);
      const merged = appliedRemoteRef.current;
      if (merged?.user) {
        snapshotRef.current = {
          ...snapshotRef.current,
          user: merged.user,
          notifications: merged.notifications,
        };
      }
      return notificationsFor(snapshotRef.current.user, snapshotRef.current.notifications);
    }
    const db = await loadOrCreateLocalDb();
    localRef.current = db;
    setLocal(db);
    const snap = snapshotFromLocal(db);
    snapshotRef.current = {
      ...snapshotRef.current,
      user: snap.user,
      notifications: snap.notifications,
    };
    return notificationsFor(snap.user, snap.notifications);
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
    clearNewCardDraft();
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
          if (!result.error) {
            const userId = snapshot.user.id;
            setRemote((existing) => ({
              ...existing,
              user: existing.user
                ? {
                    ...existing.user,
                    username: patch.username,
                    displayName: patch.displayName,
                    bio: patch.bio,
                    avatarDataUrl: patch.avatarDataUrl,
                    coverDataUrl: patch.coverDataUrl,
                  }
                : existing.user,
              profiles: existing.profiles.map((profile) =>
                profile.id === userId
                  ? {
                      ...profile,
                      username: patch.username,
                      displayName: patch.displayName,
                      bio: patch.bio,
                      avatarDataUrl: patch.avatarDataUrl,
                      coverDataUrl: patch.coverDataUrl,
                    }
                  : profile,
              ),
            }));
          }
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
    [commitLocal, mode, snapshot.user],
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
        const viewerId = current.user.id;
        const beforeFollows = current.follows;
        const beforeCounts = followCountsRef.current;
        const next = toggleFollowLocal({
          follows: beforeFollows,
          counts: beforeCounts,
          viewerId,
          targetId: userId,
          now: new Date().toISOString(),
          viewerFollowingCount: beforeCounts[viewerId]?.following ?? beforeFollows.filter((edge) => edge.followerId === viewerId).length,
          targetFollowerCount: beforeCounts[userId]?.followers ?? 0,
        });
        followCountsRef.current = next.counts;
        snapshotRef.current = { ...current, follows: next.follows };
        setFollowCounts(next.counts);
        setRemote((existing) => ({ ...existing, follows: next.follows }));
        try {
          const result = await remoteToggleFollow(client, viewerId, userId, !next.following);
          if (result.error) {
            followCountsRef.current = beforeCounts;
            snapshotRef.current = { ...snapshotRef.current, follows: beforeFollows };
            setFollowCounts(beforeCounts);
            setRemote((existing) => ({ ...existing, follows: beforeFollows }));
            setStatus(result.error);
            return result;
          }
          setStatus(result.notice ?? null);
          return result;
        } catch (error) {
          followCountsRef.current = beforeCounts;
          snapshotRef.current = { ...snapshotRef.current, follows: beforeFollows };
          setFollowCounts(beforeCounts);
          setRemote((existing) => ({ ...existing, follows: beforeFollows }));
          const message = error instanceof Error ? error.message : "Could not update that follow.";
          setStatus(message);
          return { error: message };
        }
      }
      if (localRef.current) commitLocal(localToggleFollow(localRef.current, userId));
      return {};
    },
    [commitLocal, mode],
  );

  const followMany = useCallback(
    async (userIds: readonly string[]): Promise<AuthResult> => {
      const current = snapshotRef.current;
      if (!current.user) return {};
      const ids = followAllIds(userIds, {
        viewerId: current.user.id,
        followingIds: current.follows
          .filter((edge) => edge.followerId === current.user?.id)
          .map((edge) => edge.followingId),
        mutedIds: current.mutedIds ?? [],
      });
      if (ids.length === 0) return {};
      const client = supabaseRef.current;
      if (mode === "supabase" && client) {
        const viewerId = current.user.id;
        const beforeFollows = current.follows;
        const beforeCounts = followCountsRef.current;
        const next = followManyLocal({
          follows: beforeFollows,
          counts: beforeCounts,
          viewerId,
          targetIds: ids,
          now: new Date().toISOString(),
          viewerFollowingCount: beforeCounts[viewerId]?.following ?? beforeFollows.filter((edge) => edge.followerId === viewerId).length,
        });
        followCountsRef.current = next.counts;
        snapshotRef.current = { ...current, follows: next.follows };
        setFollowCounts(next.counts);
        setRemote((existing) => ({ ...existing, follows: next.follows }));
        try {
          const result = await remoteFollowAll(client, viewerId, ids);
          if (result.error) {
            followCountsRef.current = beforeCounts;
            snapshotRef.current = { ...snapshotRef.current, follows: beforeFollows };
            setFollowCounts(beforeCounts);
            setRemote((existing) => ({ ...existing, follows: beforeFollows }));
            setStatus(result.error);
            return result;
          }
          setStatus(result.notice ?? null);
          return result;
        } catch (error) {
          followCountsRef.current = beforeCounts;
          snapshotRef.current = { ...snapshotRef.current, follows: beforeFollows };
          setFollowCounts(beforeCounts);
          setRemote((existing) => ({ ...existing, follows: beforeFollows }));
          const message = error instanceof Error ? error.message : "Could not follow those collectors.";
          setStatus(message);
          return { error: message };
        }
      }
      const db = localRef.current;
      if (!db) return {};
      let next = db;
      for (const id of ids) {
        const already = next.follows.some(
          (edge) => edge.followerId === next.sessionUserId && edge.followingId === id,
        );
        if (!already) next = localToggleFollow(next, id);
      }
      commitLocal(next);
      return {};
    },
    [commitLocal, mode],
  );

  const refreshSuggestions = useCallback(() => {
    setSuggestionEpoch((epoch) => epoch + 1);
  }, []);

  const createPost = useCallback(
    async (input: PostWrite): Promise<AuthResult & { postId?: string }> => {
      const client = supabaseRef.current;
      if (mode === "supabase" && client && snapshot.user) {
        const authorId = snapshot.user.id;
        const tempId = `pending-${Date.now()}`;
        const photos = draftPostPhotos(input);
        const pending = pendingPost({
          id: tempId,
          authorId,
          body: input.body.trim(),
          imageDataUrl: photos[0] ?? null,
          images: photos,
          card: input.card ?? null,
          quotedPostId: input.quotedPostId?.trim() || null,
          createdAt: new Date().toISOString(),
        });
        const place = (posts: Post[]) => insertFirst(posts, pending);
        setRemote((existing) => ({
          ...existing,
          posts: place(existing.posts),
          homePosts: place(existing.homePosts ?? existing.posts),
        }));
        try {
          const result = await remoteCreatePost(client, authorId, input);
          if (result.error || !result.postId) {
            const drop = (posts: Post[]) => dropById(posts, tempId);
            setRemote((existing) => ({
              ...existing,
              posts: drop(existing.posts),
              homePosts: drop(existing.homePosts ?? []),
            }));
            return result.error ? result : { error: "Could not publish that post." };
          }
          const swap = (posts: Post[]) => replaceId(posts, tempId, result.postId!);
          setRemote((existing) => ({
            ...existing,
            posts: swap(existing.posts),
            homePosts: swap(existing.homePosts ?? []),
          }));
          trackEvent("post_created");
          if (result.notice) setStatus(result.notice);
          return result;
        } catch (error) {
          const drop = (posts: Post[]) => dropById(posts, tempId);
          setRemote((existing) => ({
            ...existing,
            posts: drop(existing.posts),
            homePosts: drop(existing.homePosts ?? []),
          }));
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
      return { error: result.error, postId: result.postId };
    },
    [commitLocal, mode, snapshot.user],
  );

  const updatePost = useCallback(
    async (
      postId: string,
      input: { body: string; imageDataUrl: string | null; images?: readonly string[] | null },
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
              const photos = draftPostPhotos(input);
              const edited = {
                ...known,
                body: input.body,
                imageDataUrl: photos[0] ?? null,
                images: photos,
              };
              storeRemembered(
                rememberedRef.current,
                [edited],
                [],
                new Set(snapshotRef.current.blockedIds ?? []),
              );
              const swap = (posts: Post[]) => posts.map((post) => (post.id === postId ? edited : post));
              setRemote((existing) => ({
                ...existing,
                posts: swap(existing.posts),
                homePosts: swap(existing.homePosts ?? []),
              }));
            }
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
    [commitLocal, mode, snapshot.user],
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
            setRemote((existing) => ({
              ...existing,
              posts: dropById(existing.posts, postId),
              homePosts: dropById(existing.homePosts ?? [], postId),
            }));
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
    [activityShell, commitLocal, mode, rememberActivity, snapshot.user],
  );

  const pinPost = useCallback(
    async (postId: string): Promise<AuthResult> => {
      const current = snapshotRef.current;
      const userId = current.user?.id;
      if (!userId) return { error: "Log in to pin a post." };
      const known =
        findKnownPost(current.posts, rememberedRef.current, postId, {
          removedIds: removedRef.current,
          blockedIds: new Set(current.blockedIds ?? []),
        }) ?? current.posts.find((post) => post.id === postId);
      if (known && known.authorId !== userId) {
        return { error: "You can only pin your own post." };
      }
      const client = supabaseRef.current;
      if (mode === "supabase" && client) {
        try {
          const result = await remotePinPost(client, postId);
          if (result.error) {
            setStatus(result.error);
            return result;
          }
          setStatus(null);
          setRemote((existing) => ({
            ...existing,
            user: existing.user ? profileWithPin([existing.user], userId, postId)[0]! : existing.user,
            profiles: profileWithPin(existing.profiles, userId, postId),
          }));
          await refreshRemote(client);
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not pin that post.";
          setStatus(message);
          return { error: message };
        }
      }
      const localDb = localRef.current;
      if (!localDb) return { error: "Still loading." };
      const result = localPinPost(localDb, postId);
      if (!result.error) commitLocal(result.db);
      else setStatus(result.error);
      return { error: result.error };
    },
    [commitLocal, mode, refreshRemote],
  );

  const unpinPost = useCallback(async (): Promise<AuthResult> => {
    const current = snapshotRef.current;
    const userId = current.user?.id;
    if (!userId) return { error: "You can only unpin your own profile." };
    const client = supabaseRef.current;
    if (mode === "supabase" && client) {
      try {
        const result = await remoteUnpinPost(client);
        if (result.error) {
          setStatus(result.error);
          return result;
        }
        setStatus(null);
        setRemote((existing) => ({
          ...existing,
          user: existing.user ? profileWithPin([existing.user], userId, null)[0]! : existing.user,
          profiles: profileWithPin(existing.profiles, userId, null),
        }));
        await refreshRemote(client);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not unpin that post.";
        setStatus(message);
        return { error: message };
      }
    }
    const localDb = localRef.current;
    if (!localDb) return { error: "Still loading." };
    const result = localUnpinPost(localDb);
    if (!result.error) commitLocal(result.db);
    else setStatus(result.error);
    return { error: result.error };
  }, [commitLocal, mode, refreshRemote]);

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
            if (result.error) setStatus(result.error);
          });
        return;
      }
      if (!localRef.current) return;
      commitLocal(localToggleLike(localRef.current, postId));
    },
    [activityShell, commitLocal, mode, rememberActivity],
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
        const before = current.reposts;
        const reposts = toggleRepostLocal(before, postId, userId, new Date().toISOString());
        const knownPosts = new Set(current.posts.map((item) => item.id));
        const visible = (rows: typeof reposts) => rows.filter((repost) => knownPosts.has(repost.postId));
        snapshotRef.current = { ...current, reposts };
        setRemote((existing) => ({
          ...existing,
          reposts: visible(reposts),
        }));
        const restore = () => {
          snapshotRef.current = { ...snapshotRef.current, reposts: before };
          setRemote((existing) => ({ ...existing, reposts: visible(before) }));
        };
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
            if (result.error) {
              restore();
              setStatus(result.error);
              return;
            }
            if (result.notice) setStatus(result.notice);
          })
          .catch((error: unknown) => {
            restore();
            setStatus(error instanceof Error ? error.message : "Could not update that repost.");
          });
        return;
      }
      if (!localRef.current) return;
      commitLocal(localToggleRepost(localRef.current, postId));
    },
    [activityShell, commitLocal, mode, rememberActivity],
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
        const tempId = `pending-${Date.now()}`;
        const comment = pendingComment({
          id: tempId,
          postId,
          authorId: current.user.id,
          body: body.trim(),
          createdAt: new Date().toISOString(),
        });
        setRemote((existing) => ({ ...existing, comments: insertFirst(existing.comments, comment) }));
        try {
          const result = await remoteAddComment(
            client,
            current.user.id,
            postId,
            body,
            post?.authorId ?? null,
          );
          if (result.error) {
            setRemote((existing) => ({ ...existing, comments: dropById(existing.comments, tempId) }));
            return result;
          }
          setRemote((existing) => ({
            ...existing,
            comments: existing.comments.map((item) =>
              item.id === tempId ? { ...item, pending: false } : item,
            ),
          }));
          if (result.notice) setStatus(result.notice);
          return result;
        } catch (error) {
          setRemote((existing) => ({ ...existing, comments: dropById(existing.comments, tempId) }));
          return { error: error instanceof Error ? error.message : "Could not post that comment." };
        }
      }
      if (!localRef.current) return { error: "Still loading." };
      const result = localAddComment(localRef.current, postId, body);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode],
  );

  // Kept below the snapshotRef writes. Reading that ref from an earlier effect
  // makes those existing assignments fail react-hooks/immutability.
  useEffect(() => {
    if (mode !== "supabase") return;
    const client = supabaseRef.current;
    if (!client) return;
    const token = ++requestRef.current;
    const postId = postIdFromPath(pathname);
    const alive = () => requestRef.current === token;
    const fail = (error: unknown) => {
      if (!alive()) return;
      setStatus(error instanceof Error ? error.message : "Could not reach Supabase.");
    };

    if (!postId) {
      // The signed-out landing page has no feed. Don't download the site snapshot.
      if (
        shouldSkipSocialSnapshot({
          pathname,
          sessionKnown,
          sessionUserId: lastUserIdRef.current,
        })
      ) {
        setReady(true);
        return;
      }
      if (!sessionKnown) return;
      // public_cards is part of this snapshot. Load it once per mount.
      if (!shouldFetchPublicCatalog({ loaded: fullSnapshotRef.current, source: "mount" })) return;
      // Home and the rest of the app still need the snapshot. Don't paint the
      // feed on a post-only snapshot while a load is in flight, or the New
      // posts pill captures an empty head. A failed load still becomes ready
      // so the status message and Try again can show.
      setReady(false);
      let snapshotFailed = false;
      void loadOnce(inflightRef.current, "snapshot", () => refreshRemote(client))
        .then(() => {
          if (alive()) setStatus(null);
        })
        .catch((error) => {
          if (!alive()) return;
          snapshotFailed = true;
          snapshotErrorRef.current = true;
          setSnapshotError(true);
          fail(error);
        })
        .finally(() => {
          const snapshotError = snapshotErrorRef.current || snapshotFailed;
          if (alive() && (fullSnapshotRef.current || snapshotError)) setReady(true);
        });
      return;
    }

    const known =
      snapshotRef.current.posts.some((post) => post.id === postId) ||
      rememberedRef.current.posts.has(postId);
    if (fullSnapshotRef.current && known) {
      setLoadingPostId((current) => (current === postId ? null : current));
      return;
    }

    setLoadingPostId(postId);
    const pending = fullSnapshotRef.current
      ? loadOnce(inflightRef.current, `missing:${postId}`, () =>
          loadPostById(client, postId, snapshotRef.current.user?.id ?? null),
        )
      : loadOnce(inflightRef.current, pathname, () => loadPostPage(client, postId));
    void pending
      .then((result) => {
        if (!alive()) return;
        setStatus(null);
        if (fullSnapshotRef.current) {
          const loaded = result as Awaited<ReturnType<typeof loadPostById>>;
          if (!loaded) return;
          const blocked = new Set(snapshotRef.current.blockedIds ?? []);
          storeRemembered(
            rememberedRef.current,
            [loaded.post, ...loaded.relatedPosts],
            loaded.profiles,
            blocked,
          );
          for (const removedId of removedRef.current) {
            forgetRememberedPost(rememberedRef.current, removedId);
          }
          setRemote((existing) =>
            mergeRememberedSnapshot(existing, rememberedRef.current, removedRef.current),
          );
          return;
        }
        applyPostPage(result as LoadedPostPage);
      })
      .catch(fail)
      .finally(() => {
        if (!alive()) return;
        setResolvedPostId(postId);
        setLoadingPostId((current) => (current === postId ? null : current));
        setReady(true);
      });
  }, [applyPostPage, mode, pathname, refreshRemote, sessionKnown]);

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

  const notifications = useMemo(
    () => notificationsFor(snapshot.user, snapshot.notifications),
    [snapshot.notifications, snapshot.user],
  );

  const groupedUnread = useMemo(() => unreadGroupCount(notifications), [notifications]);
  const unreadCount = mode === "supabase" ? inboxUnread.notifications : groupedUnread;

  const markNotificationsRead = useCallback((ids?: readonly string[]) => {
    const current = snapshotRef.current;
    if (!current.user) return;
    const userId = current.user.id;
    const only = ids ? new Set(ids) : null;
    if (only && only.size === 0) return;
    const matches = (note: Notification) =>
      note.recipientId === userId && !note.read && (!only || only.has(note.id));
    if (!current.notifications.some(matches)) return;
    if (mode === "supabase") {
      const marked = current.notifications.filter(matches).length;
      setInboxUnread((counts) => ({
        ...counts,
        notifications: Math.max(0, counts.notifications - marked),
      }));
      setRemote((existing) => ({
        ...existing,
        notifications: existing.notifications.map((note) =>
          matches(note) ? { ...note, read: true } : note,
        ),
      }));
      const client = supabaseRef.current;
      if (!client) return;
      void remoteMarkNotificationsRead(client, userId, ids).then((result) => {
        if (result.error) setStatus(result.error);
        else refreshUnreadRef.current();
      });
      return;
    }
    if (!localRef.current) return;
    commitLocal(localMarkNotificationsRead(localRef.current, ids));
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
  const unreadMessageCount = mode === "supabase" ? inboxUnread.messages : listedUnreadMessages;

  const sendMessage = useCallback(
    async (
      receiverId: string,
      content: string,
      preview?: CardMessagePreview | null,
    ): Promise<AuthResult> => {
      const current = snapshotRef.current;
      if (!current.user) return { error: "Log in to send a message." };
      const cardPreview = preview ? parseCardPreview(preview) : null;
      const refused = offerSendError({
        senderId: current.user.id,
        receiverId,
        blocked: (current.blockedIds ?? []).includes(receiverId),
        muted: (current.mutedIds ?? []).includes(receiverId),
        preview: cardPreview,
      });
      if (refused) return { error: refused };
      if (mode === "supabase") {
        const client = supabaseRef.current;
        if (!client) return { error: "Still loading." };
        const tempId = `pending-${Date.now()}`;
        const message = pendingMessage({
          id: tempId,
          senderId: current.user.id,
          receiverId,
          content: content.trim(),
          createdAt: new Date().toISOString(),
          cardPreview,
        });
        setRemote((existing) => ({
          ...existing,
          messages: insertFirst(existing.messages ?? [], message),
        }));
        try {
          const result = await remoteSendMessage(
            client,
            current.user.id,
            receiverId,
            content,
            cardPreview,
          );
          if (result.error) {
            setRemote((existing) => ({
              ...existing,
              messages: dropById(existing.messages ?? [], tempId),
            }));
            return result;
          }
          setRemote((existing) => ({
            ...existing,
            messages: (existing.messages ?? []).map((item) =>
              item.id === tempId ? { ...item, pending: false } : item,
            ),
          }));
          return result;
        } catch (error) {
          setRemote((existing) => ({
            ...existing,
            messages: dropById(existing.messages ?? [], tempId),
          }));
          return { error: error instanceof Error ? error.message : "Could not send that message." };
        }
      }
      if (!localRef.current) return { error: "Still loading." };
      const result = localSendMessage(localRef.current, receiverId, content, cardPreview);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode],
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
        const marked = (current.messages ?? []).filter(
          (message) => message.senderId === partnerId && message.receiverId === userId && !message.read,
        ).length;
        setInboxUnread((counts) => ({
          ...counts,
          messages: Math.max(0, counts.messages - marked),
        }));
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
          else refreshUnreadRef.current();
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

  const repliesBy = useCallback(
    (userId: string) =>
      profileReplies(snapshot.comments, userId, {
        posts: snapshot.posts,
        blockedIds: snapshot.blockedIds ?? [],
        viewerId: snapshot.user?.id ?? null,
        dropMissing: mode !== "supabase",
      }),
    [mode, snapshot.blockedIds, snapshot.comments, snapshot.posts, snapshot.user?.id],
  );

  const followerCount = useCallback(
    (userId: string) => {
      const known = followCounts[userId];
      if (known) return known.followers;
      if (mode === "supabase" && userId !== snapshot.user?.id) return 0;
      return snapshot.follows.filter((edge) => edge.followingId === userId).length;
    },
    [followCounts, mode, snapshot.follows, snapshot.user?.id],
  );
  const followingCount = useCallback(
    (userId: string) => {
      const known = followCounts[userId];
      if (known) return known.following;
      if (mode === "supabase" && userId !== snapshot.user?.id) return 0;
      return snapshot.follows.filter((edge) => edge.followerId === userId).length;
    },
    [followCounts, mode, snapshot.follows, snapshot.user?.id],
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
      setHomeHiddenAuthorIds(null);
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

  const fallbackSuggestions = useMemo(() => {
    const viewerId = snapshot.user?.id ?? null;
    const followingIds = viewerId
      ? snapshot.follows
          .filter((edge) => edge.followerId === viewerId)
          .map((edge) => edge.followingId)
      : [];
    // Every loaded profile is already in memory. Keep a few extra candidates
    // ahead of the test-account filter so the rail does not come up short.
    const displayLimit = snapshot.profiles.length;
    const candidates = snapshot.profiles.slice(0, followSuggestionFetchLimit(displayLimit));
    return followSuggestions(candidates, { viewerId, followingIds, limit: displayLimit });
  }, [snapshot.follows, snapshot.profiles, snapshot.user]);

  const suggestions = useMemo(() => {
    const viewerId = snapshot.user?.id ?? null;
    const followingIds = viewerId
      ? snapshot.follows
          .filter((edge) => edge.followerId === viewerId)
          .map((edge) => edge.followingId)
      : [];
    return mergeRankedSuggestions({
      fallback: fallbackSuggestions,
      server: rankedRows,
      viewerId,
      followingIds,
      blockedIds: snapshot.blockedIds ?? [],
      mutedIds: snapshot.mutedIds ?? [],
    });
  }, [
    fallbackSuggestions,
    rankedRows,
    snapshot.blockedIds,
    snapshot.follows,
    snapshot.mutedIds,
    snapshot.user,
  ]);

  const profileByUsername = useCallback(
    (username: string) =>
      snapshot.profiles.find((profile) => profile.username === username.trim().toLowerCase()),
    [snapshot.profiles],
  );

  const withPagingLock = useCallback(async (key: string, run: () => Promise<void>) => {
    if (pagingLock.current.has(key)) return;
    pagingLock.current.add(key);
    try {
      await run();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load more.");
    } finally {
      pagingLock.current.delete(key);
    }
  }, []);

  const loadMoreNotifications = useCallback(async () => {
    const client = supabaseRef.current;
    const viewerId = snapshotRef.current.user?.id;
    const cursor = notificationCursorRef.current;
    if (mode !== "supabase" || !client || !viewerId || !cursor) return;
    await withPagingLock("notifications", async () => {
      const page = await loadNotificationPage(client, viewerId, cursor);
      notificationCursorRef.current = page.cursor;
      setNotificationsHasMore(page.hasMore);
      setRemote((existing) => ({
        ...existing,
        notifications: mergeById(existing.notifications, page.notifications),
        profiles: mergeProfiles(existing.profiles, page.profiles),
      }));
    });
  }, [mode, withPagingLock]);

  const loadMoreMessages = useCallback(async () => {
    const client = supabaseRef.current;
    const viewerId = snapshotRef.current.user?.id;
    const cursor = messageCursorRef.current;
    if (mode !== "supabase" || !client || !viewerId || !cursor) return;
    await withPagingLock("messages", async () => {
      const page = await loadInboxPage(client, viewerId, cursor);
      if (page.error) throw new Error(page.error);
      messageCursorRef.current = page.cursor;
      setMessagesHasMore(page.hasMore);
      const people = await loadMessagePartners(client, viewerId, page.messages, null);
      setRemote((existing) => ({
        ...existing,
        messages: mergeById(existing.messages ?? [], page.messages),
        profiles: mergeProfiles(existing.profiles, people),
      }));
    });
  }, [mode, withPagingLock]);

  const loadMoreThread = useCallback(async () => {
    const client = supabaseRef.current;
    const viewerId = snapshotRef.current.user?.id;
    const partnerId = threadPartnerRef.current;
    const cursor = threadCursorRef.current;
    if (mode !== "supabase" || !client || !viewerId || !partnerId || !cursor) return;
    await withPagingLock("thread", async () => {
      const page = await loadThreadPage(client, viewerId, partnerId, cursor);
      if (page.error) throw new Error(page.error);
      threadCursorRef.current = page.cursor;
      setThreadHasMore(page.hasMore);
      setRemote((existing) => ({
        ...existing,
        messages: mergeById(existing.messages ?? [], page.messages),
      }));
    });
  }, [mode, withPagingLock]);

  const loadMoreFollows = useCallback(async () => {
    const client = supabaseRef.current;
    const cursor = followCursorRef.current;
    const list = followListRef.current;
    if (mode !== "supabase" || !client || !cursor || !list) return;
    await withPagingLock("follows", async () => {
      const page = await loadFollowList(client, {
        direction: list.direction,
        username: list.username,
        viewer: snapshotRef.current.user,
        cursor,
      });
      followCursorRef.current = page.cursor;
      setFollowsHasMore(page.hasMore);
      if (!page.profile) return;
      const profile = page.profile;
      setRemote((existing) => ({
        ...existing,
        profiles: mergeProfiles(existing.profiles, [profile, ...page.profiles]),
        follows: appendFollowList(existing.follows, page.follows),
      }));
    });
  }, [mode, withPagingLock]);

  const loadMoreCards = useCallback(async () => {
    const client = supabaseRef.current;
    const ownerId = cardOwnerRef.current;
    const cursor = cardCursorRef.current;
    if (mode !== "supabase" || !client || !ownerId || !cursor) return;
    await withPagingLock("cards", async () => {
      const page = await loadOwnerCardPage(client, ownerId, cursor);
      cardCursorRef.current = page.cursor;
      setCardsHasMore(page.hasMore);
      setRemote((existing) => ({
        ...existing,
        publicCards: appendOwnerCards(existing.publicCards, ownerId, page.cards),
      }));
    });
  }, [mode, withPagingLock]);

  const value = useMemo<SocialContextValue>(
    () => ({
      ready,
      sessionKnown,
      sessionUserId,
      hasFullSnapshot,
      loadingPostId,
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
      pinPost,
      unpinPost,
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
      hiddenAuthorIds: snapshot.hiddenAuthorIds ?? [],
      mutedIds,
      safetyAccounts,
      applySafetyChange,
      commentsFor,
      repliesBy,
      notifications,
      unreadCount,
      notificationsHasMore,
      loadMoreNotifications,
      markNotificationsRead,
      messages,
      unreadMessageCount,
      messagesHasMore,
      loadMoreMessages,
      threadHasMore,
      loadMoreThread,
      followsHasMore,
      loadMoreFollows,
      cardsHasMore,
      loadMoreCards,
      homeHiddenAuthorIds,
      sendMessage,
      markThreadRead,
      feed,
      follows: snapshot.follows,
      rememberPosts,
      findPost,
      removedPostIds,
      suggestions,
      suggestionsReady,
      refreshSuggestions,
      followMany,
      profileByUsername,
      postCardValues,
      postCardValuesLoading,
      postCardValuesMessage,
    }),
    [
      addComment,
      applySafetyChange,
      blockedIds,
      snapshot.hiddenAuthorIds,
      commentsFor,
      markNotificationsRead,
      markThreadRead,
      messages,
      notifications,
      createPost,
      updatePost,
      deleteComment,
      deletePost,
      pinPost,
      unpinPost,
      repliesBy,
      feed,
      followMany,
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
      loadingPostId,
      repostCount,
      snapshot.reposts,
      followingCount,
      hasFullSnapshot,
      homePosts,
      homeReposts,
      isFollowing,
      mode,
      mutedIds,
      profileByUsername,
      postCardValues,
      postCardValuesLoading,
      postCardValuesMessage,
      ready,
      sessionKnown,
      sessionUserId,
      refresh,
      refreshSuggestions,
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
      suggestionsReady,
      toggleFollow,
      toggleLike,
      toggleRepost,
      unreadCount,
      unreadMessageCount,
      notificationsHasMore,
      loadMoreNotifications,
      messagesHasMore,
      loadMoreMessages,
      threadHasMore,
      loadMoreThread,
      followsHasMore,
      loadMoreFollows,
      cardsHasMore,
      loadMoreCards,
      homeHiddenAuthorIds,
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
