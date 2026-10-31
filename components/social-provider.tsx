"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { withFollowEdge } from "@/lib/social/follow-edge";
import { usePathname } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trackEvent } from "@/lib/analytics";
import { pingBadgeCheck } from "@/lib/badges/client";
import { clearNewCardDraft } from "@/lib/cards/new-card-draft";
import { clearComposeDraft } from "@/lib/social/compose-draft";
import { forgetEmailHint } from "@/lib/pwa/install-step";
import { activityFrom, emptyActivity, loadActivity, saveActivity, type ActivityStore } from "@/lib/social/activity";
import {
  createRememberedPosts,
  findKnownPost,
  forgetRememberedPost,
  mergeRememberedSnapshot,
  storeRemembered,
} from "@/lib/social/remembered-posts";
import type { LocalDb } from "@/lib/social/local-db";
import { canDeleteReply, stateAfterReplyDelete } from "@/lib/social/reply-delete";
import {
  likesMigratedFlag,
  markLikesMigrated,
  migrateStoredLikes,
  optimisticLikeCount,
  unionLikes,
} from "@/lib/social/likes";
import { authSnapshotReload } from "@/lib/social/auth-snapshot";
import { type LoadedPostPage, loadPostById, loadPostEngagement, loadPostPage } from "@/lib/social/load-feed-page";
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
import { preloadOnHint, sessionHinted } from "@/lib/auth/session-hint";
import { seedsViewer } from "@/lib/auth/route-access";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import {
  cursorsAfterRefresh,
  emptyInboxCursors,
  keepLoadedInbox,
  loadMessagePage,
  loadNotificationPage,
  mergeById,
  mergeNewestPage,
  type InboxCursors,
} from "@/lib/social/inbox-pages";
import { loadHiddenAuthorIds } from "@/lib/safety/filters";
import { keepLoadedProfiles, profileKeys } from "@/lib/social/profile-cache";
import { engagementKeys, mergeEngagement, postIdsFromKeys } from "@/lib/social/engagement";
import {
  cardsForKeys,
  createKeyBatcher,
  createPublicCardBatcher,
  emptyPublicCardCache,
  failPublicCards,
  mergePublicCards,
  publicCardsFailed as cacheFailed,
  publicCardsSettled,
  retryPublicCards,
  type PublicCardCache,
} from "@/lib/social/public-card-cache";
import { getSupabaseConfig } from "@/lib/supabase/client";
import type { CardValueResult } from "@/lib/value/types";
import { useCardValues } from "@/lib/value/use-card-values";
import { afterFirstIdle } from "@/lib/ui/idle";
import { runSignOutHook } from "@/lib/auth/sign-out-hook";
import { emitSocialAction } from "@/lib/social/action-signal";
import type {
  AuthResult,
  CardMessagePreview,
  DirectMessage,
  FollowEdge,
  Notification,
  Post,
  PostComment,
  PostLike,
  PostRepost,
  Profile,
  ProfilePatch,
  SignUpInput,
  SocialSnapshot,
} from "@/lib/social/types";
import { draftPostPhotos, type PostWrite } from "@/lib/social/post-photos";
import { profileReplies, profileWithPin } from "@/lib/social/profile-tabs";
import { isOptimisticReply, optimisticReply, withoutOptimisticReply } from "@/lib/social/reply-images";

/** Sending and reading DMs, from its own chunk: fetched at the first idle moment, or on first use. */
const loadDmActions = () => import("@/lib/social/dm-actions");
// The hosted reads and writes come with the Supabase client, off the first load.
const loadRemote = () => import("@/lib/social/remote");

export type SocialContextValue = {
  ready: boolean;
  /** True after the site snapshot is in memory. A cold post page leaves this false. */
  hasFullSnapshot: boolean;
  /** Set while a post screen is fetching a post that is not in memory yet. */
  loadingPostId: string | null;
  mode: "local" | "supabase";
  user: Profile | null;
  profiles: Profile[];
  posts: Post[];
  /**
   * Public cards read so far (hosted), or every public card on this device
   * (local). Ask for the ones a screen needs with requestPublicCards.
   */
  publicCards: SocialSnapshot["publicCards"];
  /** Reads public cards by key (see publicCardKeys). Same-tick asks share one batch. */
  requestPublicCards: (keys: readonly string[]) => void;
  /** True once every key has been read, found or not. Always true on local accounts. */
  publicCardsReady: (keys: readonly string[]) => boolean;
  /** Any of these keys' last read failed. Asking again (requestPublicCards) retries. */
  publicCardsFailed: (keys: readonly string[]) => boolean;
  /** Forgets every public card read, so screens read them again (a visibility change). */
  resetPublicCards: () => void;
  /** Reads people by key (see profileKeys) into `profiles`. Same-tick asks share one batch. */
  requestProfiles: (keys: readonly string[]) => void;
  /** True once every key has been read, found or not. Always true on local accounts. */
  profilesReady: (keys: readonly string[]) => boolean;
  /** Any of these keys' last read failed. Asking again (requestProfiles) retries. */
  profilesFailed: (keys: readonly string[]) => boolean;
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
  addComment: (postId: string, body: string, images?: readonly string[]) => Promise<AuthResult>;
  isLiked: (postId: string) => boolean;
  isReposted: (postId: string) => boolean;
  likeCount: (postId: string) => number;
  repostCount: (postId: string) => number;
  reposts: PostRepost[];
  commentsFor: (postId: string) => PostComment[];
  repliesBy: (userId: string) => ReturnType<typeof profileReplies>;
  notifications: Notification[];
  unreadCount: number;
  markNotificationsRead: (ids?: readonly string[]) => void;
  messages: DirectMessage[];
  unreadMessageCount: number;
  sendMessage: (
    receiverId: string,
    content: string,
    preview?: CardMessagePreview | null,
  ) => Promise<AuthResult>;
  markThreadRead: (partnerId: string) => void;
  /** Whether Load more has older notifications or inbox messages to read. */
  inboxMore: { notifications: boolean; messages: boolean };
  loadOlderNotifications: () => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  /** Reads one thread's newest page (first call) or its next older page (`older`). */
  loadThreadMessages: (partnerId: string, older?: boolean) => Promise<void>;
  /** True when a thread has older messages to load. */
  threadMore: (partnerId: string) => boolean;
  /** Reads one person's newest replies (their profile's Replies tab) into `commentsFor` / `repliesBy`. */
  loadRepliesBy: (userId: string) => Promise<void>;
  /**
   * Opening Notifications or Messages: their newest pages and unread rows only,
   * merged over what is loaded. Returns the notifications. Local accounts: `refresh`.
   */
  refreshInbox: () => Promise<Notification[]>;
  /** Opening a follow list: the viewer's own follow edges. */
  refreshFollows: () => Promise<void>;
  feed: TimelineItem[];
  follows: FollowEdge[];
  /** Merge posts loaded by a paged feed so likes, quotes, and edits can see them. */
  rememberPosts: (posts: Post[], profiles?: Profile[], likes?: PostLike[] | null) => void;
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

type LocalAccounts = typeof import("@/lib/social/local-db");
let localAccounts: LocalAccounts | null = null;

/**
 * On-device accounts (no Supabase keys). Loaded only in that mode, before its
 * database exists, so hosted screens never download it.
 */
function loadLocalAccounts(): Promise<LocalAccounts> {
  return import("@/lib/social/local-db").then((lib) => (localAccounts = lib));
}

/**
 * Hosted mode also keeps a few on-device records (reply hearts, the activity
 * fallback) with the same helpers. Runs at once when the code is in (it is
 * fetched at the first idle moment), else right after it loads.
 */
function withLocalAccounts(run: (lib: LocalAccounts) => void) {
  if (localAccounts) run(localAccounts);
  else void loadLocalAccounts().then(run);
}

/** The on-device accounts code. Only called once local mode has loaded it. */
function localLib(): LocalAccounts {
  if (!localAccounts) throw new Error("Local accounts are not loaded.");
  return localAccounts;
}

// A session cookie says someone is signed in: start fetching the client now,
// while the page hydrates, so the snapshot read starts as early as before.
// A screen the server drew for this viewer fetches it after hydration instead.
if (preloadOnHint()) void loadSupabaseBrowser();
if (preloadOnHint()) void loadRemote();

/** Signed in on a screen the server drew: the snapshot read can wait for idle. */
function deferUntilIdle(): boolean {
  return sessionHinted() && seedsViewer(window.location.pathname);
}

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

function notificationsFor(user: { id: string } | null, notes: Notification[]): Notification[] {
  if (!user) return [];
  return notes
    .filter((note) => note.recipientId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function patchRememberedLike(post: Post, incoming: Post | undefined, pending: boolean): Post {
  if (pending || !incoming) return post;
  return {
    ...post,
    ...(typeof incoming.likeCount === "number" ? { likeCount: incoming.likeCount } : {}),
    ...(typeof incoming.viewerLiked === "boolean" ? { viewerLiked: incoming.viewerLiked } : {}),
  };
}

/** Replace this viewer's likes for the posts that were just loaded. */
function viewerLikeSlice(
  existing: SocialSnapshot,
  likes: PostLike[] | null,
  posts: readonly Post[],
): Pick<SocialSnapshot, "likes" | "likesReady"> {
  if (likes === null) return { likes: existing.likes, likesReady: existing.likesReady };
  const userId = existing.user?.id;
  if (!userId) return { likes: existing.likes, likesReady: true };
  const ids = new Set(posts.map((post) => post.id));
  return {
    likes: [
      ...existing.likes.filter((like) => like.userId !== userId || !ids.has(like.postId)),
      ...likes.filter((like) => like.userId === userId && ids.has(like.postId)),
    ],
    likesReady: true,
  };
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

/** The same set without `keys`, or the same object when none were in it. */
function withoutKeys(set: ReadonlySet<string>, keys: readonly string[]): ReadonlySet<string> {
  if (!keys.some((key) => set.has(key))) return set;
  const next = new Set(set);
  for (const key of keys) next.delete(key);
  return next;
}

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [ready, setReady] = useState(false);
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
  const [likesMigrated, setLikesMigrated] = useState(false);
  const [removedPostIds, setRemovedPostIds] = useState<ReadonlySet<string>>(() => new Set());
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const localRef = useRef<LocalDb | null>(null);
  const likeQueue = useRef(Promise.resolve());
  const likeGeneration = useRef(new Map<string, number>());
  const pendingLikes = useRef(new Map<string, number>());
  const snapshotRef = useRef(emptySnapshot);
  const repostQueue = useRef(Promise.resolve());
  const rememberedRef = useRef(createRememberedPosts());
  const removedRef = useRef<ReadonlySet<string>>(new Set());
  const fullSnapshotRef = useRef(false);
  const snapshotErrorRef = useRef(false);
  const requestRef = useRef(0);
  const snapshotRefreshRef = useRef(createSnapshotRefresher<SocialSnapshot>());
  const appliedRemoteRef = useRef<SocialSnapshot | null>(null);
  const inflightRef = useRef(new Map<string, Promise<unknown>>());
  const reloadRef = useRef<(client: SupabaseClient) => Promise<void>>(async () => {});
  const lastUserIdRef = useRef<string | null>(null);
  // Signed-out visitors don't need realtime or card prices for the first
  // paint. That work waits for the first idle moment after load.
  const [firstIdle, setFirstIdle] = useState(false);
  /** Where each notifications / messages Load more continues from. */
  const [inboxCursors, setInboxCursors] = useState<InboxCursors>(emptyInboxCursors);
  localRef.current = local;

  const routePostId = postIdFromPath(pathname);
  const routePostKnown =
    routePostId !== null && remote.posts.some((post) => post.id === routePostId);
  if (mode === "supabase" && !routePostId && !hasFullSnapshot && !snapshotError && ready) {
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

  useEffect(() => afterFirstIdle(() => setFirstIdle(true)), []);
  // Hosted mode keeps reply hearts on this device with the local helpers:
  // have them in hand before the first tap, off the first load.
  useEffect(() => {
    if (firstIdle) void loadLocalAccounts().catch(() => {});
  }, [firstIdle]);

  const refreshRemote = useCallback(async (client: SupabaseClient) => {
    await snapshotRefreshRef.current(
      () => loadRemote().then((remote) => remote.loadSocialSnapshot(client)),
      (snapshot) => {
        const hadError = snapshotErrorRef.current;
        snapshotErrorRef.current = false;
        fullSnapshotRef.current = true;
        const merged = mergeRememberedSnapshot(snapshot, rememberedRef.current, removedRef.current);
        appliedRemoteRef.current = merged;
        // The whole app redraws on a new snapshot. As a transition React
        // yields between rows, so it never blocks a tap or a frame.
        startTransition(() => {
          if (hadError) setStatus(null);
          setSnapshotError(false);
          setHasFullSnapshot(true);
          // Older notification and message pages the viewer loaded stay.
          // People a screen already read stay too, for the same viewer.
          setRemote((existing) => keepLoadedProfiles(existing, keepLoadedInbox(existing, merged)));
          setInboxCursors((current) => cursorsAfterRefresh(current, snapshot.inbox, snapshot.user?.id ?? null));
          if (!postIdFromPath(window.location.pathname)) setReady(true);
        });
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
    const pending = pendingLikes.current;
    const kept = posts.map((post) => {
      if (!pending.has(post.id)) return post;
      const held =
        rememberedRef.current.posts.get(post.id) ??
        snapshotRef.current.posts.find((item) => item.id === post.id);
      return held ? { ...post, likeCount: held.likeCount, viewerLiked: held.viewerLiked } : post;
    });
    storeRemembered(rememberedRef.current, kept, page.profiles, blocked);
    for (const removedId of removedRef.current) forgetRememberedPost(rememberedRef.current, removedId);
    setRemote((existing) => {
      if (fullSnapshotRef.current) {
        const incoming = new Map(kept.map((post) => [post.id, post]));
        const patch = (post: Post) =>
          patchRememberedLike(post, incoming.get(post.id), pending.has(post.id));
        return mergeRememberedSnapshot(
          {
            ...existing,
            posts: existing.posts.map(patch),
            homePosts: existing.homePosts?.map(patch),
            ...viewerLikeSlice(existing, page.likes, kept),
          },
          rememberedRef.current,
          removedRef.current,
        );
      }
      return {
        user: page.user,
        profiles: page.profiles,
        posts: kept,
        follows: [],
        likes: page.likes ?? [],
        likesReady: page.likes !== null,
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
      const id = postIdFromPath(window.location.pathname);
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
    let unsubscribe = () => {};
    setActivity(loadActivity());
    if (!getSupabaseConfig().configured) {
      const { issue } = getSupabaseConfig();
      if (issue) setStatus(issue);
      loadLocalAccounts()
        .then((lib) => lib.loadOrCreateLocalDb())
        .then((db) => {
        if (cancelled) return;
        setMode("local");
        setLocal(db);
        setReady(true);
      });
      return () => {
        cancelled = true;
      };
    }

    // supabase-js loads in its own chunk, after hydration. The mode flips once
    // the client is in hand, so every effect keyed on it finds supabaseRef set.
    // A screen the server drew for this viewer already shows its data, so
    // there the client and the snapshot read wait for the first idle moment
    // and stay off the main thread while the page hydrates and paints.
    const startClient = (run: () => void) => (deferUntilIdle() ? afterFirstIdle(run) : (run(), () => {}));
    // The hosted reads and writes load alongside the client, so the first read doesn't wait on them.
    const startHosted = () => {
      void loadRemote().catch(() => {});
      return loadSupabaseBrowser();
    };
    const stopStart = startClient(() => void startHosted().then((client) => {
      if (cancelled || !client) return;
      supabaseRef.current = client;
      setMode("supabase");
      // INITIAL_SESSION would repeat the first load. Sign-in and sign-out still refresh.
      // SIGNED_IN also fires on load and whenever a tab becomes visible. Remember the
      // session user first so those repeats do not reload public_cards.
      void client.auth
        .getSession()
        .then(({ data: sessionData }) => {
          if (!cancelled) lastUserIdRef.current = sessionData.session?.user?.id ?? null;
        })
        .finally(() => {
          if (cancelled) return;
          const { data } = client.auth.onAuthStateChange((event, session) => {
            if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
            const decision = authSnapshotReload({
              event,
              nextUserId: session?.user?.id ?? null,
              lastUserId: lastUserIdRef.current,
            });
            lastUserIdRef.current = decision.lastUserId;
            if (!decision.reload) return;
            setTimeout(() => {
              void reloadRef
                .current(client)
                .then(() => setStatus(null))
                .catch((error: unknown) => {
                  setStatus(error instanceof Error ? error.message : "Could not reach Supabase.");
                });
            }, 0);
          });
          unsubscribe = () => data.subscription.unsubscribe();
        });
    }));

    return () => {
      cancelled = true;
      stopStart();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (mode !== "supabase" || !ready) return;
    const client = supabaseRef.current;
    if (!client) return;
    const postId = postIdFromPath(pathname);
    const viewerId = remote.user?.id ?? null;
    // Realtime waits for the first idle moment, for visitors and readers alike.
    if (!firstIdle) return;
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
            startTransition(() => setRemote((existing) => applyRealtimePatch(existing, patch)));
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
  }, [applyPostPage, firstIdle, hasFullSnapshot, mode, pathname, ready, remote.user?.id]);

  const baseSnapshot = mode === "local" && local ? localLib().snapshotFromLocal(local) : remote;
  const postIds = new Set(baseSnapshot.posts.map((post) => post.id));
  const viewerId = baseSnapshot.user?.id ?? null;
  // TODO: remove the localStorage likes fallback in 2 weeks (after 2026-11-06).
  const serverLikesReady = mode === "supabase" && likesMigrated && baseSnapshot.likesReady === true;
  const snapshot =
    mode === "supabase"
      ? {
          ...baseSnapshot,
          likes: serverLikesReady
            ? baseSnapshot.likes
            : unionLikes(baseSnapshot.likes, activity.likes, viewerId),
          reposts: [
            ...baseSnapshot.reposts,
            ...activity.reposts.filter((repost) => !postIds.has(repost.postId)),
          ],
        }
      : baseSnapshot;
  snapshotRef.current = snapshot;

  const [cardCache, setCardCache] = useState<PublicCardCache>(emptyPublicCardCache);
  // Every screen part that asks in one tick shares one read (see createPublicCardBatcher).
  const [cardBatcher] = useState(() =>
    createPublicCardBatcher(
      async (keys) => {
        // The reads load on first use, off every screen's first-load JS.
        const [client, { loadPublicCardsForKeys }] = await Promise.all([
          loadSupabaseBrowser(),
          import("@/lib/social/load-public-cards"),
        ]);
        return client ? loadPublicCardsForKeys(client, keys) : [];
      },
      (cards, keys) => startTransition(() => setCardCache((current) => mergePublicCards(current, cards, keys))),
      (keys) => startTransition(() => setCardCache((current) => failPublicCards(current, keys))),
    ),
  );
  // Bumped on reset, so every screen part asks for its cards again.
  const [cardGeneration, setCardGeneration] = useState(0);
  // Hosted vs local accounts is known from the start, unlike `mode`, which
  // reads "local" until the first effect, so nothing counts as read early.
  const hosted = getSupabaseConfig().configured;
  const requestPublicCards = useCallback(
    (keys: readonly string[]) => {
      if (!hosted) return;
      // A failed key asked again is on the way, not failed.
      setCardCache((current) => retryPublicCards(current, keys));
      cardBatcher.request(keys);
    },
    // cardGeneration: a new function after a reset, so screens ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardBatcher, hosted, cardGeneration],
  );
  const publicCardsReady = useCallback(
    (keys: readonly string[]) => !hosted || publicCardsSettled(cardCache, keys),
    [cardCache, hosted],
  );
  const publicCardsFailed = useCallback(
    (keys: readonly string[]) => hosted && cacheFailed(cardCache, keys),
    [cardCache, hosted],
  );
  // Who can see which card changed (a new viewer, a refresh, the viewer's own
  // visibility change): forget every read and drop reads on the way.
  const resetPublicCards = useCallback(() => {
    cardBatcher.reset();
    setCardCache(emptyPublicCardCache());
    setCardGeneration((value) => value + 1);
  }, [cardBatcher]);
  const loadedPublicCards = useMemo(() => cardsForKeys(cardCache), [cardCache]);

  // People by id or handle, for screens that name someone the snapshot didn't bring.
  const [profileSettled, setProfileSettled] = useState<ReadonlySet<string>>(() => new Set());
  // Keys whose last read failed: not settled, so no screen calls the person missing.
  const [profileFailed, setProfileFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [profileBatcher] = useState(() =>
    createKeyBatcher<Profile>(
      async (keys) => {
        const [client, { loadProfilesForKeys }] = await Promise.all([
          loadSupabaseBrowser(),
          import("@/lib/social/profile-cache"),
        ]);
        if (!client) return [];
        const { data } = await client.auth.getSession();
        const user = data.session?.user;
        return loadProfilesForKeys(client, keys, user ? { id: user.id, email: user.email ?? "" } : null);
      },
      (people, keys) =>
        startTransition(() => {
          if (people.length > 0) {
            setRemote((existing) => {
              const byId = new Map(existing.profiles.map((profile) => [profile.id, profile]));
              for (const profile of people) byId.set(profile.id, profile);
              return { ...existing, profiles: [...byId.values()] };
            });
          }
          setProfileSettled((current) => new Set([...current, ...keys]));
          setProfileFailed((current) => withoutKeys(current, keys));
        }),
      (keys) => startTransition(() => setProfileFailed((current) => new Set([...current, ...keys]))),
      // A failed key asked again is on the way, not failed.
      (keys) => setProfileFailed((current) => withoutKeys(current, keys)),
    ),
  );
  // Bumped on reset, so every screen part asks for its people again.
  const [peopleGeneration, setPeopleGeneration] = useState(0);
  const requestProfiles = useCallback(
    (keys: readonly string[]) => {
      if (hosted) profileBatcher.request(keys);
    },
    // peopleGeneration: a new function after a reset, so screens ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hosted, profileBatcher, peopleGeneration],
  );
  // A new viewer sees different people (blocks go both ways): forget every
  // read, failed or not, and drop reads on the way.
  const resetPeople = useCallback(() => {
    profileBatcher.reset();
    setProfileSettled(new Set());
    setProfileFailed(new Set());
    setPeopleGeneration((value) => value + 1);
  }, [profileBatcher]);
  // Everything read for one viewer: on a refresh, sign-in, sign-up, sign-out,
  // or a new viewer id, it all starts over.
  const resetViewerReads = useCallback(() => {
    resetPublicCards();
    resetPeople();
  }, [resetPeople, resetPublicCards]);
  const viewerReadsId = snapshot.user?.id ?? null;
  const viewerReadsRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (viewerReadsRef.current === viewerReadsId) return;
    if (!ready) return;
    const before = viewerReadsRef.current;
    viewerReadsRef.current = viewerReadsId;
    if (before !== undefined) resetViewerReads();
  }, [ready, resetViewerReads, viewerReadsId]);
  const profilesReady = useCallback(
    (keys: readonly string[]) => !hosted || keys.every((key) => profileSettled.has(key)),
    [hosted, profileSettled],
  );
  const profilesFailed = useCallback(
    (keys: readonly string[]) => hosted && keys.some((key) => profileFailed.has(key) && !profileSettled.has(key)),
    [hosted, profileFailed, profileSettled],
  );

  const loadOlderNotifications = useCallback(async () => {
    const client = supabaseRef.current;
    const viewerId = snapshotRef.current.user?.id;
    const cursor = inboxCursors.notifications;
    if (mode !== "supabase" || !client || !viewerId || !cursor) return;
    await loadOnce(inflightRef.current, "older:notifications", async () => {
      const mutedHidden = await loadHiddenAuthorIds(client, true);
      const page = await loadNotificationPage(client, viewerId, { cursor, mutedHidden });
      setRemote((existing) =>
        existing.user?.id === viewerId
          ? { ...existing, notifications: mergeById(existing.notifications, page.rows, "newest") }
          : existing,
      );
      setInboxCursors((current) =>
        current.viewerId === viewerId
          ? { ...current, notifications: page.next, advanced: { ...current.advanced, notifications: true } }
          : current,
      );
    });
  }, [inboxCursors.notifications, mode]);

  const loadOlderMessages = useCallback(async () => {
    const client = supabaseRef.current;
    const viewerId = snapshotRef.current.user?.id;
    const cursor = inboxCursors.messages;
    if (mode !== "supabase" || !client || !viewerId || !cursor) return;
    await loadOnce(inflightRef.current, "older:messages", async () => {
      const blockedHidden = await loadHiddenAuthorIds(client, false);
      const page = await loadMessagePage(client, viewerId, { cursor, blockedHidden });
      setRemote((existing) =>
        existing.user?.id === viewerId
          ? { ...existing, messages: mergeById(existing.messages, page.rows, "oldest") }
          : existing,
      );
      setInboxCursors((current) =>
        current.viewerId === viewerId
          ? { ...current, messages: page.next, advanced: { ...current.advanced, messages: true } }
          : current,
      );
    });
  }, [inboxCursors.messages, mode]);

  const loadThreadMessages = useCallback(
    async (partnerId: string, older = false) => {
      const client = supabaseRef.current;
      const viewerId = snapshotRef.current.user?.id;
      if (mode !== "supabase" || !client || !viewerId || !partnerId) return;
      const cursor = inboxCursors.threads[partnerId];
      // First open reads the newest page once; Load older needs somewhere to continue from.
      if (older ? !cursor : cursor !== undefined) return;
      await loadOnce(inflightRef.current, `thread:${partnerId}:${older ? cursor?.id : "newest"}`, async () => {
        const blockedHidden = await loadHiddenAuthorIds(client, false);
        const page = await loadMessagePage(client, viewerId, {
          cursor: older ? (cursor ?? null) : null,
          blockedHidden,
          partnerId,
        });
        const pair = (message: { senderId: string; receiverId: string }) =>
          (message.senderId === viewerId && message.receiverId === partnerId) ||
          (message.senderId === partnerId && message.receiverId === viewerId);
        setRemote((existing) => {
          if (existing.user?.id !== viewerId) return existing;
          const messages = older
            ? mergeById(existing.messages, page.rows, "oldest")
            : mergeNewestPage(existing.messages, page.rows, { complete: !page.next, order: "oldest", within: pair });
          return { ...existing, messages };
        });
        setInboxCursors((current) =>
          current.viewerId === viewerId
            ? { ...current, threads: { ...current.threads, [partnerId]: page.next } }
            : current,
        );
      });
    },
    [inboxCursors.threads, mode],
  );

  /** After a send: that thread's newest page, merged over what is loaded. */
  const refreshThread = useCallback(async (client: SupabaseClient, viewerId: string, partnerId: string) => {
    const blockedHidden = await loadHiddenAuthorIds(client, false);
    const page = await loadMessagePage(client, viewerId, { cursor: null, blockedHidden, partnerId });
    const pair = (message: { senderId: string; receiverId: string }) =>
      (message.senderId === viewerId && message.receiverId === partnerId) ||
      (message.senderId === partnerId && message.receiverId === viewerId);
    setRemote((existing) =>
      existing.user?.id === viewerId
        ? {
            ...existing,
            messages: mergeNewestPage(existing.messages, page.rows, { complete: !page.next, order: "oldest", within: pair }),
          }
        : existing,
    );
  }, []);

  const threadMore = useCallback(
    (partnerId: string) => Boolean(inboxCursors.threads[partnerId]),
    [inboxCursors.threads],
  );
  const inboxMore = useMemo(
    () => ({
      notifications: mode === "supabase" && Boolean(inboxCursors.notifications),
      messages: mode === "supabase" && Boolean(inboxCursors.messages),
    }),
    [inboxCursors.messages, inboxCursors.notifications, mode],
  );
  const publicCards = hosted ? loadedPublicCards : snapshot.publicCards;

  useEffect(() => {
    if (mode !== "supabase") return;
    const userId = remote.user?.id;
    if (!userId) return;
    const client = supabaseRef.current;
    let cancelled = false;
    if (likesMigratedFlag(userId)) {
      void Promise.resolve().then(() => {
        if (!cancelled) setLikesMigrated(true);
      });
      return () => {
        cancelled = true;
      };
    }
    if (!client) return;
    void migrateStoredLikes(client, userId, loadActivity().likes).then((result) => {
      if (cancelled || !result.ok) return;
      try {
        markLikesMigrated(userId);
      } catch {
        // Quota or disabled storage. The rows are already copied, so don't retry every load.
      }
      setLikesMigrated(true);
      if (result.inserted.length === 0) return;
      const inserted = new Set(result.inserted);
      const bump = (post: Post): Post => {
        if (!inserted.has(post.id) || pendingLikes.current.has(post.id)) return post;
        if (post.viewerLiked === true) return post;
        const likeCount = typeof post.likeCount === "number" ? post.likeCount + 1 : post.likeCount;
        return { ...post, viewerLiked: true, likeCount };
      };
      for (const id of inserted) {
        const held = rememberedRef.current.posts.get(id);
        if (held) rememberedRef.current.posts.set(id, bump(held));
      }
      setRemote((existing) => ({
        ...existing,
        posts: existing.posts.map(bump),
        homePosts: existing.homePosts?.map(bump),
        likes: [
          ...existing.likes,
          ...[...inserted]
            .filter((id) => !existing.likes.some((like) => like.postId === id && like.userId === userId))
            .map((id) => ({ postId: id, userId, createdAt: new Date().toISOString() })),
        ],
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [mode, remote.user?.id]);
  const suggestionUserId = snapshot.user?.id ?? null;
  const seenDraftUserId = useRef(suggestionUserId);
  useEffect(() => {
    if (seenDraftUserId.current === suggestionUserId) return;
    seenDraftUserId.current = suggestionUserId;
    clearNewCardDraft();
    clearComposeDraft();
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
      if (!cancelled) startTransition(() => setSuggestionResult({ key, rows }));
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
  const holdCardValues = !snapshot.user && !firstIdle;
  const postCardIds = useMemo(
    () => (postCardIdKey && !holdCardValues ? postCardIdKey.split(",") : []),
    [holdCardValues, postCardIdKey],
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
    localLib().saveLocalDb(db);
    setLocal(db);
  }, []);

  const refresh = useCallback(async (): Promise<Notification[]> => {
    const client = supabaseRef.current;
    if (mode === "supabase" && client) {
      resetViewerReads();
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
    const db = await (await loadLocalAccounts()).loadOrCreateLocalDb();
    localRef.current = db;
    setLocal(db);
    const snap = localLib().snapshotFromLocal(db);
    snapshotRef.current = {
      ...snapshotRef.current,
      user: snap.user,
      notifications: snap.notifications,
    };
    return notificationsFor(snap.user, snap.notifications);
  }, [mode, refreshRemote, resetViewerReads]);

  const refreshInbox = useCallback(async (): Promise<Notification[]> => {
    const client = supabaseRef.current;
    const viewerId = snapshotRef.current.user?.id ?? null;
    if (mode !== "supabase" || !client || !viewerId) return refresh();
    const patch = await loadRealtimePatch(client, new Set(["notifications", "messages"]), {
      viewerId,
      postId: null,
    });
    const merged = applyRealtimePatch(snapshotRef.current, patch);
    snapshotRef.current = { ...snapshotRef.current, notifications: merged.notifications, messages: merged.messages };
    setRemote((existing) => applyRealtimePatch(existing, patch));
    return notificationsFor(merged.user, merged.notifications);
  }, [mode, refresh]);

  const refreshFollows = useCallback(async () => {
    const client = supabaseRef.current;
    const viewerId = snapshotRef.current.user?.id;
    if (mode !== "supabase" || !client || !viewerId) return;
    const { data, error } = await client
      .from("follows")
      .select("follower_id, following_id, created_at")
      .or(`follower_id.eq.${viewerId},following_id.eq.${viewerId}`);
    if (error) return;
    const follows = ((data ?? []) as { follower_id: string; following_id: string; created_at: string }[]).map(
      (row): FollowEdge => ({ followerId: row.follower_id, followingId: row.following_id, createdAt: row.created_at }),
    );
    setRemote((existing) => (existing.user?.id === viewerId ? { ...existing, follows } : existing));
    requestProfiles(profileKeys({ ids: follows.flatMap((edge) => [edge.followerId, edge.followingId]) }));
  }, [mode, requestProfiles]);

  const signUp = useCallback(
    async (input: SignUpInput): Promise<AuthResult> => {
      const client = supabaseRef.current;
      if (mode === "supabase" && client) {
        try {
          const result = await (await loadRemote()).remoteSignUp(client, input);
          if (!result.error && !result.notice) {
            resetViewerReads();
            await refreshRemote(client);
          }
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not create that account." };
        }
      }
      const current = localRef.current;
      if (!current) return { error: "Still loading." };
      const result = await localLib().localSignUp(current, input);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode, refreshRemote, resetViewerReads],
  );

  const signIn = useCallback(
    async (email: string, password: string, captchaToken?: string): Promise<AuthResult> => {
      const client = supabaseRef.current;
      if (mode === "supabase" && client) {
        try {
          const result = await (await loadRemote()).remoteSignIn(client, email, password, captchaToken);
          if (!result.error) {
            resetViewerReads();
            await refreshRemote(client);
          }
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not log in." };
        }
      }
      const current = localRef.current;
      if (!current) return { error: "Still loading." };
      const result = await localLib().localSignIn(current, email, password);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode, refreshRemote, resetViewerReads],
  );

  const signOut = useCallback(async () => {
    clearNewCardDraft();
    clearComposeDraft();
    // Every logout path (side menu, account deletion) comes through here.
    forgetEmailHint();
    const client = supabaseRef.current;
    if (mode === "supabase" && client) {
      // While the session is still valid: this device stops getting pushes.
      await runSignOutHook();
      await (await loadRemote()).remoteSignOut(client);
      resetViewerReads();
      await refreshRemote(client);
      return;
    }
    if (localRef.current) commitLocal(localLib().localSignOut(localRef.current));
  }, [commitLocal, mode, refreshRemote, resetViewerReads]);

  /** Re-reads these people (even if already loaded) after a change to them. */
  const rereadPeople = useCallback(async (client: SupabaseClient, ids: readonly string[]) => {
    if (ids.length === 0) return;
    const { data } = await client.auth.getSession();
    const user = data.session?.user;
    const viewer = user ? { id: user.id, email: user.email ?? "" } : null;
    const { loadProfilesForKeys } = await import("@/lib/social/profile-cache");
    const people = await loadProfilesForKeys(client, profileKeys({ ids }), viewer);
    if (people.length === 0) return;
    const byId = new Map(people.map((profile) => [profile.id, profile]));
    setRemote((existing) => ({
      ...existing,
      user: existing.user ? (byId.get(existing.user.id) ?? existing.user) : existing.user,
      profiles: [
        ...existing.profiles.map((profile) => byId.get(profile.id) ?? profile),
        ...people.filter((profile) => !existing.profiles.some((known) => known.id === profile.id)),
      ],
    }));
  }, []);

  /** Re-reads one post's replies and reposts after a change to them. */
  const rereadEngagement = useCallback(async (client: SupabaseClient, postId: string) => {
    const viewerId = snapshotRef.current.user?.id ?? "";
    const [muted, blocked] = viewerId
      ? await Promise.all([loadHiddenAuthorIds(client, true), loadHiddenAuthorIds(client, false)])
      : [[], []];
    const fresh = await loadPostEngagement(client, [postId], viewerId, { muted, blocked });
    setRemote((existing) => {
      const next = mergeEngagement(existing, [postId], fresh, isOptimisticReply);
      snapshotRef.current = { ...snapshotRef.current, comments: next.comments, reposts: next.reposts };
      return next;
    });
  }, []);

  /**
   * After a change to one post's replies or reposts: that post's engagement.
   * A cold post page (no snapshot yet) reloads its own page instead.
   */
  const rereadPost = useCallback(
    async (client: SupabaseClient, postId: string) => {
      if (postIdFromPath(window.location.pathname) === postId && !fullSnapshotRef.current) {
        await reloadRef.current(client);
        return;
      }
      await rereadEngagement(client, postId);
    },
    [rereadEngagement],
  );

  const updateProfile = useCallback(
    async (patch: ProfilePatch): Promise<AuthResult> => {
      const client = supabaseRef.current;
      if (mode === "supabase" && client && snapshot.user) {
        try {
          const result = await (await loadRemote()).remoteUpdateProfile(client, snapshot.user.id, patch);
          // Just the viewer's own profile, as saved (an uploaded photo comes back as its URL).
          if (!result.error) await rereadPeople(client, [snapshot.user.id]);
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not save your profile." };
        }
      }
      const current = localRef.current;
      if (!current) return { error: "Still loading." };
      const result = localLib().localUpdateProfile(current, patch);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode, rereadPeople, snapshot.user],
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
        const following = current.follows.some(
          (edge) => edge.followerId === viewerId && edge.followingId === userId,
        );
        // Counts and buttons flip now. The server answer confirms or rolls back.
        const paintFollow = (on: boolean) => {
          const follows = withFollowEdge(
            snapshotRef.current.follows,
            viewerId,
            userId,
            on,
            new Date().toISOString(),
          );
          snapshotRef.current = { ...snapshotRef.current, follows };
          setRemote((existing) => ({
            ...existing,
            follows: withFollowEdge(existing.follows, viewerId, userId, on, new Date().toISOString()),
          }));
        };
        paintFollow(!following);
        let saved = false;
        try {
          const result = await (await loadRemote()).remoteToggleFollow(client, viewerId, userId, following);
          saved = !result.error;
          if (result.error) {
            paintFollow(following);
            setStatus(result.error);
            return result;
          }
          if (!following) {
            pingBadgeCheck();
            emitSocialAction("follow");
            // The edge is already painted. Their profile, for the viewer's own following list.
            requestProfiles(profileKeys({ ids: [userId] }));
          }
          setStatus(result.notice ?? null);
          return result;
        } catch (error) {
          if (!saved) paintFollow(following);
          const message = error instanceof Error ? error.message : "Could not update that follow.";
          setStatus(message);
          return { error: message };
        }
      }
      if (localRef.current) {
        const db = localRef.current;
        const wasFollowing = db.follows.some(
          (edge) => edge.followerId === db.sessionUserId && edge.followingId === userId,
        );
        commitLocal(localLib().localToggleFollow(db, userId));
        if (!wasFollowing) emitSocialAction("follow");
      }
      return {};
    },
    [commitLocal, mode, requestProfiles],
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
        try {
          const result = await (await loadRemote()).remoteFollowAll(client, current.user.id, ids);
          if (result.error) {
            setStatus(result.error);
            return result;
          }
          pingBadgeCheck();
          emitSocialAction("follow");
          // In place: add the new edges, then read those people for the viewer's following list.
          const viewerId = current.user.id;
          const at = new Date().toISOString();
          setRemote((existing) => ({
            ...existing,
            follows: ids.reduce((edges, id) => withFollowEdge(edges, viewerId, id, true, at), existing.follows),
          }));
          requestProfiles(profileKeys({ ids }));
          setStatus(result.notice ?? null);
          return result;
        } catch (error) {
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
        if (!already) next = localLib().localToggleFollow(next, id);
      }
      commitLocal(next);
      return {};
    },
    [commitLocal, mode, requestProfiles],
  );

  const refreshSuggestions = useCallback(() => {
    setSuggestionEpoch((epoch) => epoch + 1);
  }, []);

  const createPost = useCallback(
    async (input: PostWrite): Promise<AuthResult & { postId?: string }> => {
      const client = supabaseRef.current;
      if (mode === "supabase" && client && snapshot.user) {
        try {
          const result = await (await loadRemote()).remoteCreatePost(client, snapshot.user.id, input);
          if (!result.error) {
            trackEvent("post_created");
            pingBadgeCheck();
            emitSocialAction("post");
            // In place: read just the new post and put it on top.
            if (result.postId) {
              const loaded = await loadPostById(client, result.postId, snapshot.user.id).catch(() => null);
              if (loaded) {
                storeRemembered(
                  rememberedRef.current,
                  [loaded.post, ...loaded.relatedPosts],
                  loaded.profiles,
                  new Set(snapshotRef.current.blockedIds ?? []),
                );
                setRemote((existing) =>
                  mergeRememberedSnapshot(
                    {
                      ...existing,
                      posts: [loaded.post, ...existing.posts.filter((post) => post.id !== loaded.post.id)],
                      homePosts: [loaded.post, ...(existing.homePosts ?? []).filter((post) => post.id !== loaded.post.id)],
                    },
                    rememberedRef.current,
                    removedRef.current,
                  ),
                );
              }
            }
            if (result.notice) setStatus(result.notice);
          }
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not publish that post." };
        }
      }
      const current = localRef.current;
      if (!current) return { error: "Still loading." };
      const result = localLib().localCreatePost(current, input);
      if (!result.error) {
        commitLocal(result.db);
        trackEvent("post_created");
        emitSocialAction("post");
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
          const result = await (await loadRemote()).remoteUpdatePost(client, snapshot.user.id, postId, input);
          if (!result.error) {
            const known = findKnownPost(
              snapshotRef.current.posts,
              rememberedRef.current,
              postId,
            );
            if (known) {
              const photos = draftPostPhotos(input);
              storeRemembered(
                rememberedRef.current,
                [{
                  ...known,
                  body: input.body,
                  imageDataUrl: photos[0] ?? null,
                  images: photos,
                }],
                [],
                new Set(snapshotRef.current.blockedIds ?? []),
              );
            }
            // In place: the edited text and photos on every copy of the post.
            const photos = draftPostPhotos(input);
            const edit = (post: Post) =>
              post.id === postId ? { ...post, body: input.body, imageDataUrl: photos[0] ?? null, images: photos } : post;
            setRemote((existing) => ({
              ...existing,
              posts: existing.posts.map(edit),
              homePosts: existing.homePosts?.map(edit),
            }));
            if (result.notice) setStatus(result.notice);
          }
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not update that post." };
        }
      }
      const current = localRef.current;
      if (!current) return { error: "Still loading." };
      const result = localLib().localUpdatePost(current, postId, input);
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
          const result = await (await loadRemote()).remoteDeletePost(client, snapshot.user.id, postId);
          if (!result.error) {
            forgetRememberedPost(rememberedRef.current, postId);
            const removed = new Set(removedRef.current);
            removed.add(postId);
            removedRef.current = removed;
            setRemovedPostIds(removed);
            withLocalAccounts((lib) => rememberActivity(lib.localDeletePost(activityShell(), postId).db));
            // In place: off every list (removedPostIds already hides it everywhere else).
            setRemote((existing) => ({
              ...existing,
              posts: existing.posts.filter((post) => post.id !== postId),
              homePosts: existing.homePosts?.filter((post) => post.id !== postId),
            }));
          }
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not delete that post." };
        }
      }
      const current = localRef.current;
      if (!current) return { error: "Still loading." };
      const result = localLib().localDeletePost(current, postId);
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
          const result = await (await loadRemote()).remotePinPost(client, postId);
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
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not pin that post.";
          setStatus(message);
          return { error: message };
        }
      }
      const localDb = localRef.current;
      if (!localDb) return { error: "Still loading." };
      const result = localLib().localPinPost(localDb, postId);
      if (!result.error) commitLocal(result.db);
      else setStatus(result.error);
      return { error: result.error };
    },
    [commitLocal, mode],
  );

  const unpinPost = useCallback(async (): Promise<AuthResult> => {
    const current = snapshotRef.current;
    const userId = current.user?.id;
    if (!userId) return { error: "You can only unpin your own profile." };
    const client = supabaseRef.current;
    if (mode === "supabase" && client) {
      try {
        const result = await (await loadRemote()).remoteUnpinPost(client);
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
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not unpin that post.";
        setStatus(message);
        return { error: message };
      }
    }
    const localDb = localRef.current;
    if (!localDb) return { error: "Still loading." };
    const result = localLib().localUnpinPost(localDb);
    if (!result.error) commitLocal(result.db);
    else setStatus(result.error);
    return { error: result.error };
  }, [commitLocal, mode]);

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
          const result = await (await loadRemote()).remoteDeleteComment(client, current.user.id, commentId);
          publish(stateAfterReplyDelete(before, commentId, result));
          // Already removed in place (publish above).
          if (result.error) return result;
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
      const result = localLib().localDeleteComment(db, commentId);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [activityShell, commitLocal, mode, rememberActivity],
  );

  const toggleLike = useCallback(
    (postId: string) => {
      const current = snapshotRef.current;
      if (!current.user) return;
      if (mode === "supabase") {
        const userId = current.user.id;
        const knownPost = findKnownPost(current.posts, rememberedRef.current, postId, {
          removedIds: removedRef.current,
          blockedIds: new Set(current.blockedIds ?? []),
        });
        // Reply hearts stay on this device. Comments are not posts, so they
        // cannot use the likes table.
        if (!knownPost) {
          const reply = current.comments.find((comment) => comment.id === postId);
          const wasLiked = current.likes.some((like) => like.postId === postId && like.userId === userId);
          withLocalAccounts((lib) => rememberActivity(lib.localToggleLike(activityShell(), postId)));
          const client = supabaseRef.current;
          if (!client || !reply) return;
          likeQueue.current = likeQueue.current
            .catch(() => undefined)
            .then(async () => {
              const result = await (await loadRemote()).remoteSyncLikeNotification(client, {
                actorId: userId,
                recipientId: reply.authorId,
                postId,
                preview: reply.body,
                liked: !wasLiked,
              });
              if (result.error) setStatus(result.error);
            });
          return;
        }

        const wasLiked =
          knownPost.viewerLiked === true ||
          (knownPost.viewerLiked !== false &&
            current.likes.some((like) => like.postId === postId && like.userId === userId));
        const nextLiked = !wasLiked;
        const baseCount =
          typeof knownPost.likeCount === "number"
            ? knownPost.likeCount
            : current.likes.filter((like) => like.postId === postId).length;
        const nextCount = optimisticLikeCount(baseCount, nextLiked);
        const generation = (likeGeneration.current.get(postId) ?? 0) + 1;
        likeGeneration.current.set(postId, generation);
        pendingLikes.current.set(postId, generation);

        const paint = (liked: boolean, count: number) => {
          const patch = (post: Post) =>
            post.id === postId ? { ...post, viewerLiked: liked, likeCount: count } : post;
          const latest = snapshotRef.current;
          const source =
            latest.posts.find((post) => post.id === postId) ??
            rememberedRef.current.posts.get(postId) ??
            knownPost;
          rememberedRef.current.posts.set(postId, patch(source));
          const without = latest.likes.filter((like) => !(like.postId === postId && like.userId === userId));
          const likes = liked
            ? [...without, { postId, userId, createdAt: new Date().toISOString() }]
            : without;
          snapshotRef.current = {
            ...latest,
            likes,
            posts: latest.posts.map(patch),
            homePosts: latest.homePosts?.map(patch),
          };
          setRemote((existing) => ({
            ...existing,
            likes,
            posts: existing.posts.map(patch),
            homePosts: existing.homePosts?.map(patch),
          }));
          rememberActivity(activityShell());
        };

        paint(nextLiked, nextCount);
        likeQueue.current = likeQueue.current
          .catch(() => undefined)
          .then(async () => {
            try {
              const { syncPostLike } = await import("@/lib/social/like-action");
              const result = await syncPostLike({ postId, liked: nextLiked });
              if (likeGeneration.current.get(postId) !== generation) return;
              pendingLikes.current.delete(postId);
              if (!result.ok) {
                setStatus(result.error);
                paint(wasLiked, baseCount);
                return;
              }
              // Table is not installed yet. Keep the device heart already painted.
              if (result.fallback) return;
              if (result.liked) emitSocialAction("like");
              if (typeof result.likeCount === "number") paint(result.liked, result.likeCount);
            } catch (error) {
              if (likeGeneration.current.get(postId) !== generation) return;
              pendingLikes.current.delete(postId);
              setStatus(error instanceof Error ? error.message : "Could not update that like.");
              paint(wasLiked, baseCount);
            }
          });
        return;
      }
      if (!localRef.current) return;
      commitLocal(localLib().localToggleLike(localRef.current, postId));
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
          withLocalAccounts((lib) => rememberActivity(lib.localToggleRepost(activityShell(), postId)));
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
            const result = await (await loadRemote()).remoteToggleRepost(client, {
              userId,
              postId,
              authorId: post.authorId,
              preview: post.body,
              reposted,
            });
            if (result.error || result.notice) setStatus(result.error ?? result.notice ?? null);
            if (!result.error && !reposted) emitSocialAction("repost");
            await rereadPost(client, postId);
          })
          .catch((error: unknown) => {
            setStatus(error instanceof Error ? error.message : "Could not update that repost.");
            return rereadPost(client, postId).catch(() => undefined);
          });
        return;
      }
      if (!localRef.current) return;
      commitLocal(localLib().localToggleRepost(localRef.current, postId));
    },
    [activityShell, commitLocal, mode, rememberActivity, rereadPost],
  );

  const addComment = useCallback(
    async (postId: string, body: string, images?: readonly string[]): Promise<AuthResult> => {
      const photos = draftPostPhotos({ images: images ?? [] });
      const text = body.trim();
      if (!text && photos.length === 0) return { error: "Write a comment." };
      const sendKey = `reply:${postId}:${text}:${photos.join("|")}`;
      const inflight = inflightRef.current.get(sendKey);
      if (inflight) return inflight as Promise<AuthResult>;
      const run = (async (): Promise<AuthResult> => {
        if (mode === "supabase") {
          const client = supabaseRef.current;
          const current = snapshotRef.current;
          if (!client) return { error: "Still loading." };
          if (!current.user) return { error: "Log in to comment." };
          const optimistic = optimisticReply({
            postId,
            authorId: current.user.id,
            body: text,
            images: photos,
          });
          const replaceComments = (map: (comments: SocialSnapshot["comments"]) => SocialSnapshot["comments"]) => {
            setRemote((existing) => {
              const comments = map(existing.comments);
              snapshotRef.current = { ...snapshotRef.current, comments };
              return { ...existing, comments };
            });
          };
          replaceComments((comments) => [...withoutOptimisticReply(comments, optimistic.id), optimistic]);
          const post = findKnownPost(current.posts, rememberedRef.current, postId, {
            removedIds: removedRef.current,
            blockedIds: new Set(current.blockedIds ?? []),
          });
          try {
            const result = await (await loadRemote()).remoteAddComment(
              client,
              current.user.id,
              postId,
              text,
              post?.authorId ?? null,
              photos,
            );
            if (result.error) {
              replaceComments((comments) => withoutOptimisticReply(comments, optimistic.id));
              return result;
            }
            emitSocialAction("reply");
            try {
              // In place: this post's replies, as saved.
              await rereadPost(client, postId);
              replaceComments((comments) => withoutOptimisticReply(comments, optimistic.id));
            } catch {
              // The reply is already saved. Leave the one local preview in place.
            }
            if (result.notice) setStatus(result.notice);
            return result;
          } catch (error) {
            replaceComments((comments) => withoutOptimisticReply(comments, optimistic.id));
            return { error: error instanceof Error ? error.message : "Could not post that comment." };
          }
        }
        if (!localRef.current) return { error: "Still loading." };
        const result = localLib().localAddComment(localRef.current, postId, text, photos);
        if (!result.error) commitLocal(result.db);
        return { error: result.error };
      })();
      inflightRef.current.set(sendKey, run);
      try {
        return await run;
      } finally {
        if (inflightRef.current.get(sendKey) === run) inflightRef.current.delete(sendKey);
      }
    },
    [commitLocal, mode, rereadPost],
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
          if (!alive() || !(fullSnapshotRef.current || snapshotError)) return;
          // Same lane as the snapshot itself, so ready never lands before it.
          if (snapshotError) setReady(true);
          else startTransition(() => setReady(true));
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
  }, [applyPostPage, mode, pathname, refreshRemote]);

  const isLiked = useCallback(
    (postId: string) => {
      const post = findKnownPost(snapshot.posts, rememberedRef.current, postId, {
        removedIds: removedRef.current,
        blockedIds: new Set(snapshot.blockedIds ?? []),
      });
      if (post?.viewerLiked === true) return true;
      if (post?.viewerLiked === false) return false;
      return Boolean(
        snapshot.user &&
          snapshot.likes.some((like) => like.postId === postId && like.userId === snapshot.user?.id),
      );
    },
    [snapshot.blockedIds, snapshot.likes, snapshot.posts, snapshot.user],
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
    (postId: string) => {
      const post = findKnownPost(snapshot.posts, rememberedRef.current, postId, {
        removedIds: removedRef.current,
        blockedIds: new Set(snapshot.blockedIds ?? []),
      });
      if (typeof post?.likeCount === "number") return post.likeCount;
      return snapshot.likes.filter((like) => like.postId === postId).length;
    },
    [snapshot.blockedIds, snapshot.likes, snapshot.posts],
  );

  const repostCount = useCallback(
    (postId: string) => snapshot.reposts.filter((repost) => repost.postId === postId).length,
    [snapshot.reposts],
  );

  const notifications = useMemo(
    () => notificationsFor(snapshot.user, snapshot.notifications),
    [snapshot.notifications, snapshot.user],
  );

  const unreadCount = useMemo(() => unreadGroupCount(notifications), [notifications]);

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
      setRemote((existing) => ({
        ...existing,
        notifications: existing.notifications.map((note) =>
          matches(note) ? { ...note, read: true } : note,
        ),
      }));
      const client = supabaseRef.current;
      if (!client) return;
      void loadRemote()
        .then((remote) => remote.remoteMarkNotificationsRead(client, userId, ids))
        .then((result) => {
        if (result.error) setStatus(result.error);
      });
      return;
    }
    if (!localRef.current) return;
    commitLocal(localLib().localMarkNotificationsRead(localRef.current, ids));
  }, [commitLocal, mode]);

  const messages = useMemo(() => {
    if (!snapshot.user) return [];
    const id = snapshot.user.id;
    return (snapshot.messages ?? [])
      .filter((message) => message.senderId === id || message.receiverId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [snapshot.messages, snapshot.user]);

  const signedIn = Boolean(snapshot.user);
  useEffect(() => {
    if (firstIdle && signedIn) void loadDmActions().catch(() => {});
  }, [firstIdle, signedIn]);

  const unreadMessageCount = messages.filter(
    (message) => message.receiverId === snapshot.user?.id && !message.read,
  ).length;

  const sendMessage = useCallback(
    async (
      receiverId: string,
      content: string,
      preview?: CardMessagePreview | null,
    ): Promise<AuthResult> => {
      if (!snapshotRef.current.user) return { error: "Log in to send a message." };
      let dm: Awaited<ReturnType<typeof loadDmActions>>;
      try {
        dm = await loadDmActions();
      } catch {
        return { error: "Could not send that message." };
      }
      const { localSendMessage, offerSendError, parseCardPreview, remoteSendMessage } = dm;
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
        try {
          const result = await remoteSendMessage(
            client,
            current.user.id,
            receiverId,
            content,
            cardPreview,
          );
          if (!result.error) {
            emitSocialAction("dm");
            // In place: that thread's newest page, with the saved message.
            await refreshThread(client, current.user.id, receiverId).catch(() => {});
          }
          return result;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not send that message." };
        }
      }
      if (!localRef.current) return { error: "Still loading." };
      const result = localSendMessage(localRef.current, receiverId, content, cardPreview);
      if (!result.error) commitLocal(result.db);
      return { error: result.error };
    },
    [commitLocal, mode, refreshThread],
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
        void loadDmActions()
          .then(({ remoteMarkThreadRead }) => remoteMarkThreadRead(client, userId, partnerId))
          .then((result) => {
            if (result.error) setStatus(result.error);
          })
          .catch(() => {});
        return;
      }
      if (!localRef.current) return;
      commitLocal(localLib().localMarkThreadRead(localRef.current, partnerId));
    },
    [commitLocal, mode],
  );

  // Replies and reposts for posts loaded after the snapshot (another feed page,
  // a card's posts, a profile), read in one batch per tick.
  const [engagementBatcher] = useState(() =>
    createKeyBatcher<{ postIds: string[]; comments: PostComment[]; reposts: PostRepost[] }>(
      async (keys) => {
        const postIds = postIdsFromKeys(keys);
        const client = await loadSupabaseBrowser();
        if (!client || postIds.length === 0) return [];
        const { data } = await client.auth.getSession();
        const viewerId = data.session?.user.id ?? "";
        const [muted, blocked] = viewerId
          ? await Promise.all([loadHiddenAuthorIds(client, true), loadHiddenAuthorIds(client, false)])
          : [[], []];
        const parts = await Promise.all(
          Array.from({ length: Math.ceil(postIds.length / 100) }, (_, index) =>
            loadPostEngagement(client, postIds.slice(index * 100, (index + 1) * 100), viewerId, { muted, blocked }),
          ),
        );
        return [
          {
            postIds,
            comments: parts.flatMap((part) => part.comments),
            reposts: parts.flatMap((part) => part.reposts),
          },
        ];
      },
      (reads) =>
        startTransition(() =>
          setRemote((existing) =>
            reads.reduce(
              (current, read) => mergeEngagement(current, read.postIds, read, isOptimisticReply),
              existing,
            ),
          ),
        ),
      // A failed read keeps what is shown; those posts are read again when asked again.
      () => {},
    ),
  );

  const rememberPosts = useCallback((posts: Post[], profiles: Profile[] = [], likes: PostLike[] | null = null) => {
    if (posts.length === 0 && profiles.length === 0 && likes === null) return;
    if (getSupabaseConfig().configured && posts.length > 0) {
      engagementBatcher.request(engagementKeys(posts.map((post) => post.id)));
    }
    const blocked = new Set(snapshotRef.current.blockedIds ?? []);
    const pending = pendingLikes.current;
    const kept = posts.map((post) => {
      if (!pending.has(post.id)) return post;
      const held =
        rememberedRef.current.posts.get(post.id) ??
        snapshotRef.current.posts.find((item) => item.id === post.id);
      return held ? { ...post, likeCount: held.likeCount, viewerLiked: held.viewerLiked } : post;
    });
    storeRemembered(rememberedRef.current, kept, profiles, blocked);
    for (const postId of removedRef.current) forgetRememberedPost(rememberedRef.current, postId);
    setRemote((existing) => {
      const incoming = new Map(kept.map((post) => [post.id, post]));
      const patch = (post: Post) => patchRememberedLike(post, incoming.get(post.id), pending.has(post.id));
      return mergeRememberedSnapshot(
        {
          ...existing,
          posts: existing.posts.map(patch),
          homePosts: existing.homePosts?.map(patch),
          ...viewerLikeSlice(existing, likes, kept),
        },
        rememberedRef.current,
        removedRef.current,
      );
    });
  }, [engagementBatcher]);

  const loadRepliesBy = useCallback(async (userId: string) => {
    if (!getSupabaseConfig().configured || !userId) return;
    const client = await loadSupabaseBrowser();
    if (!client) return;
    await loadOnce(inflightRef.current, `replies:${userId}`, async () => {
      const { data } = await client.auth.getSession();
      const viewerId = data.session?.user.id ?? null;
      const mutedHidden = viewerId ? await loadHiddenAuthorIds(client, true) : [];
      const { loadUserReplies } = await import("@/lib/social/user-replies");
      const replies = await loadUserReplies(client, { userId, viewerId, mutedHidden });
      startTransition(() =>
        setRemote((existing) => {
          const known = new Set(existing.comments.map((comment) => comment.id));
          return { ...existing, comments: [...existing.comments, ...replies.filter((reply) => !known.has(reply.id))] };
        }),
      );
    });
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

  // Rows that arrive later (an older page, realtime, a new follower) can name
  // someone not read yet. Read them, so nobody shows as "Someone".
  const missingPeopleKey = useMemo(() => {
    if (mode !== "supabase") return "";
    const missing = new Set<string>();
    const need = (id: string | null | undefined) => {
      if (id && !profilesById.has(id)) missing.add(id);
    };
    for (const note of snapshot.notifications) need(note.actorId);
    for (const message of snapshot.messages) {
      need(message.senderId);
      need(message.receiverId);
    }
    for (const post of snapshot.posts) need(post.authorId);
    for (const comment of snapshot.comments) need(comment.authorId);
    return profileKeys({ ids: [...missing] }).join("\n");
  }, [mode, profilesById, snapshot.comments, snapshot.messages, snapshot.notifications, snapshot.posts]);
  useEffect(() => {
    if (missingPeopleKey) requestProfiles(missingPeopleKey.split("\n"));
  }, [missingPeopleKey, requestProfiles]);

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

  const fallbackSuggestions = useMemo(() => {
    // Hosted: "Who to follow" comes only from the server's ranking (load-suggestions).
    // Local accounts have every profile on the device, so they rank those as before.
    if (mode === "supabase") return [];
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
  }, [mode, snapshot.follows, snapshot.profiles, snapshot.user]);

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

  const value = useMemo<SocialContextValue>(
    () => ({
      ready,
      hasFullSnapshot,
      loadingPostId,
      mode,
      user: snapshot.user,
      profiles: snapshot.profiles,
      posts: snapshot.posts,
      publicCards,
      requestPublicCards,
      publicCardsReady,
      publicCardsFailed,
      resetPublicCards,
      requestProfiles,
      profilesReady,
      profilesFailed,
      inboxMore,
      loadOlderNotifications,
      loadOlderMessages,
      loadThreadMessages,
      threadMore,
      loadRepliesBy,
      refreshInbox,
      refreshFollows,
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
      mutedIds,
      safetyAccounts,
      applySafetyChange,
      commentsFor,
      repliesBy,
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
      commentsFor,
      repliesBy,
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
      refresh,
      refreshSuggestions,
      signIn,
      signOut,
      safetyAccounts,
      sendMessage,
      signUp,
      snapshot.posts,
      snapshot.profiles,
      publicCards,
      requestPublicCards,
      publicCardsReady,
      publicCardsFailed,
      resetPublicCards,
      requestProfiles,
      profilesReady,
      profilesFailed,
      inboxMore,
      loadOlderNotifications,
      loadOlderMessages,
      loadThreadMessages,
      threadMore,
      loadRepliesBy,
      refreshInbox,
      refreshFollows,
      snapshot.user,
      status,
      suggestions,
      suggestionsReady,
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
