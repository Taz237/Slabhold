"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Compass, ImagePlus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { MentionTextarea } from "@/components/mention-textarea";
import { solidButton } from "@/components/button-styles";
import { useCollection } from "@/components/collection-provider";
import { AddToHomeTip } from "@/components/add-to-home-tip";
import { AttachCardField } from "@/components/attach-card-field";
import { HomeFirstCardPrompt } from "@/components/home-first-card-prompt";
import { GetStartedCard, useGetStartedDismissed, useRememberNewUser } from "@/components/get-started";
import { useOnboardingBusy } from "@/components/onboarding/use-onboarding";
import { useSocial } from "@/components/social-provider";
import { LoadMore } from "@/components/load-more";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { usePagedTimeline } from "@/components/use-paged-timeline";
import { EmptyState, PostSkeletonList, TimelineSkeleton } from "@/components/status";
import { CollectorSuggestions, FollowingEmpty, WhoToFollowCard } from "@/components/collector-suggestions";
import {
  FeedItem,
  LaneTabs,
  NewPostsPill,
  useEntranceDelays,
  useLaneScroll,
  useNewPostsAbove,
  type HomeLane,
} from "@/components/timeline-ui";
import { MovingToday } from "@/components/moving-today";
import { shouldShowFirstCardWelcome } from "@/lib/collection/welcome";
import { Tweet } from "@/components/tweet";
import { WhatsNewCard } from "@/components/whats-new-card";
import { loginPath, signupPath } from "@/lib/auth/safe-next";
import { takeCompose } from "@/lib/capture";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { ComposePhotoDrafts } from "@/components/compose-photo-drafts";
import { PhotoFileInputs } from "@/components/photo-file-inputs";
import { usePostPhotos } from "@/components/use-post-photos";
import { PHOTO_HEIC_ERROR, readPhotoFile } from "@/lib/photos";
import {
  POST_PHOTO_LIMIT_ERROR,
  POST_PHOTO_SINGLE_ERROR,
  photoAttachFull,
  photoAttachHint,
  postPhotoLimit,
  postsSupportMultipleImages,
} from "@/lib/social/post-photos";
import {
  checklistBlocksAddToHomeTip,
  checklistState,
  defaultHomeTab,
  newUserOnFullSnapshot,
  profileStepDone,
} from "@/lib/social/get-started";
import { followingAuthorIds, homeHead, showsNewPosts } from "@/lib/social/feed-page";
import { getStartedHintScript, type HomeSeed } from "@/lib/social/home-seed";
import { presentForYouFeed } from "@/lib/social/for-you-display";
import { addUnblockedProfiles, presentPagedItems } from "@/lib/social/paged-items";
import { publicTimeline } from "@/lib/social/timeline";
import { officialUpdatesUserId } from "@/lib/social/official-updates";
import { useProgressiveRows } from "@/lib/ui/use-progressive-rows";
import { SUGGESTION_RAIL_SIZE, inlineSuggestionPool, whoToFollowAfter } from "@/lib/ui/timeline";
import { POST_LIMIT, type PublicCard } from "@/lib/social/types";

function readComposerPhoto(file: File) {
  return readPhotoFile(file, 960);
}

/**
 * Strict mode calls a state initializer twice. The first call consumes the
 * saved photo, and the second call has to see that same photo.
 */
let heldComposePrefill: string | null = null;

function takeComposePrefill(): string | null {
  try {
    const saved = takeCompose();
    if (saved) heldComposePrefill = saved;
    return saved ?? heldComposePrefill;
  } catch {
    return heldComposePrefill;
  }
}

/** Posts on a phone's first screen. Their photos load at once; the rest load as they scroll in. */
const FIRST_SCREEN_POSTS = 2;

/** Rows the server draws for Home's first screen, a little past a tall phone. */
const SEEDED_ENTRIES = 8;

/** The Home tab you were on, so coming Back from a post keeps it. */
let rememberedLane: { userId: string; lane: HomeLane } | null = null;

export function FeedView({
  movingToday,
  seed = null,
}: {
  movingToday?: ReactNode;
  /** Home's first page, read on the server for this request. */
  seed?: HomeSeed | null;
} = {}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const {
    ready,
    hasFullSnapshot,
    user,
    feed: followedFeed,
    posts,
    homePosts,
    homeReposts,
    reposts,
    follows,
    suggestions,
    suggestionsReady,
    profiles,
    followingCount,
    refresh,
    mode,
    postCardValuesMessage,
    rememberPosts,
    removedPostIds,
    blockedIds,
    mutedIds,
  } = useSocial();
  const { cards, ready: cardsReady, syncError } = useCollection();
  const { dismissed, dismiss } = useGetStartedDismissed(user?.id ?? null);
  // First-run setup, "You're in" and the tour come first. Older prompts wait.
  const onboardingBusy = useOnboardingBusy();
  const following = user ? followingCount(user.id) : 0;
  // Drawn from the server's first screen until the full snapshot is in.
  const seededScreen = Boolean(seed) && !hasFullSnapshot;
  // Until the collection loads, the card count the server read stands in.
  const cardCount = cardsReady || !seed ? cards.length : seed.cardCount;
  const cardsKnown = cardsReady || Boolean(seed);
  const countsReady = Boolean(user) && ready && cardsKnown && !syncError;
  const wasNewOnLoad = newUserOnFullSnapshot({
    fullSnapshot: countsReady && (mode !== "supabase" || hasFullSnapshot),
    followingCount: following,
    cardCount,
  });
  const wasNewUser = useRememberNewUser(user?.id ?? null, wasNewOnLoad);
  const checklist = checklistState({
    cardCount,
    followingCount: following,
    profileDone: profileStepDone({
      avatarDataUrl: user?.avatarDataUrl,
      bio: user?.bio,
    }),
    dismissed,
    ready: countsReady,
    createdAt: user?.createdAt ?? null,
    wasNewUser,
  });
  // The server's Get started: what localStorage says (dismissed, not new)
  // is applied before the first paint by getStartedHintScript.
  const started = seededScreen && seed ? seed.getStarted : checklist;
  const showAddToHome =
    Boolean(user) &&
    !onboardingBusy &&
    !checklistBlocksAddToHomeTip({
      visible: started.visible,
      complete: started.complete,
      dismissed,
      wasNewUser,
      createdAt: user?.createdAt ?? null,
    });
  const showWelcome =
    Boolean(user) &&
    !onboardingBusy &&
    (seededScreen || !started.visible) &&
    shouldShowFirstCardWelcome({
      cardCount,
      ready: cardsKnown,
      syncError,
    });
  // On the server's screen the first-card prompt is drawn under Get started
  // too, and CSS shows exactly one of them once the hint script has run.
  const welcomeAfterGetStarted = seededScreen && started.visible;
  useEffect(() => {
    if (!seededScreen) delete document.documentElement.dataset.getStartedHidden;
  }, [seededScreen]);
  const [lane, setLaneState] = useState<HomeLane>(() =>
    user && rememberedLane?.userId === user.id ? rememberedLane.lane : (seed?.lane ?? "foryou"),
  );
  const setLane = useCallback(
    (next: HomeLane) => {
      setLaneState(next);
      if (user) rememberedLane = { userId: user.id, lane: next };
    },
    [user],
  );
  const laneStartRef = useRef<HTMLDivElement>(null);
  const laneTop = useCallback(() => {
    const start = laneStartRef.current;
    if (!start) return 0;
    const tabs = start.nextElementSibling;
    const stick = tabs ? parseFloat(getComputedStyle(tabs).top) || 0 : 0;
    return start.getBoundingClientRect().top + window.scrollY - stick;
  }, []);
  const switchLane = useLaneScroll(lane, setLane, laneTop);
  const [refreshKey, setRefreshKey] = useState(0);
  /** Bumps after a soft refresh, so the "New posts" check starts from what is now shown. */
  const [headKey, setHeadKey] = useState(0);
  const headEpoch = `${refreshKey}.${headKey}`;
  const [capturedHead, setCapturedHead] = useState<{ key: string; head: ReturnType<typeof homeHead> } | null>(
    null,
  );
  const followingIds = useMemo(
    () => (user ? followingAuthorIds(follows, user.id) : []),
    [follows, user],
  );
  const head = homeHead(homePosts, homeReposts);
  const paging = mode === "supabase" && ready;
  const forYouPage = usePagedTimeline({
    enabled: paging,
    scope: "public",
    viewerId: user?.id ?? null,
    refreshKey,
    blockedIds,
    mutedIds,
    rememberPosts,
    initial: seed?.lane === "foryou" ? seed.page : null,
  });
  const followingPage = usePagedTimeline({
    enabled: paging && Boolean(user),
    scope: "following",
    authorIds: followingIds,
    viewerId: user?.id ?? null,
    refreshKey,
    blockedIds,
    mutedIds,
    rememberPosts,
    initial: seed?.lane === "following" ? seed.page : null,
  });
  // The seeded first screen has no site-wide head yet. "New posts" starts from the full snapshot.
  if (paging && hasFullSnapshot && !forYouPage.loading && (capturedHead === null || capturedHead.key !== headEpoch)) {
    setCapturedHead({ key: headEpoch, head });
  }
  const refreshForYou = forYouPage.refresh;
  const refreshFollowing = followingPage.refresh;
  /** Pull to refresh and the pill: newest posts land on top of the list already shown. */
  const refreshFeeds = useCallback(async () => {
    await Promise.all([refresh(), refreshForYou(), refreshFollowing()]);
    setHeadKey((key) => key + 1);
  }, [refresh, refreshFollowing, refreshForYou]);
  const hasNewPosts =
    paging &&
    capturedHead !== null &&
    capturedHead.key === headEpoch &&
    !forYouPage.loading &&
    showsNewPosts(capturedHead.head, head, user?.id ?? null, removedPostIds);
  const activePage = lane === "following" ? followingPage : forYouPage;
  // Back from a post: the tab you were reading counts as already picked.
  const pickedFor = useRef<string | null>(rememberedLane?.userId ?? null);
  // The order first shown sticks, so following someone doesn't reshuffle the rail.
  const [suggestionIds, setSuggestionIds] = useState<string[] | null>(null);
  // The rail as first drawn, so the seeded rail holds while the provider asks again.
  const [shownSuggestions, setShownSuggestions] = useState<Map<string, (typeof suggestions)[number]> | null>(null);
  if (ready && suggestionsReady && user && suggestionIds === null && suggestions.length > 0) {
    setSuggestionIds(suggestions.map((profile) => profile.id));
    setShownSuggestions(new Map(suggestions.map((profile) => [profile.id, profile])));
  }
  const suggestionById = new Map(suggestions.map((profile) => [profile.id, profile]));
  const rankedIds = suggestionIds ?? (suggestionsReady ? suggestions.map((profile) => profile.id) : []);
  const suggestionFor = (id: string) =>
    suggestionById.get(id) ??
    (suggestionsReady ? undefined : shownSuggestions?.get(id)) ??
    profiles.find((profile) => profile.id === id);
  const suggestionRail = rankedIds
    .slice(0, SUGGESTION_RAIL_SIZE)
    .map(suggestionFor)
    .filter((profile) => profile != null);
  // Inline "Who to follow" cards pick up after the rail, so nobody shows twice.
  const inlineSuggestions = user
    ? inlineSuggestionPool({
        ranked: [...new Set([...rankedIds, ...suggestions.map((profile) => profile.id)])]
          .map(suggestionFor)
          .filter((profile) => profile != null),
        railIds: suggestionRail.map((profile) => profile.id),
        viewerId: user.id,
        officialId: officialUpdatesUserId(),
        followingIds,
        blockedIds,
        mutedIds,
      })
    : [];
  const blocked = useMemo(() => new Set(blockedIds), [blockedIds]);
  const muted = useMemo(() => new Set(mutedIds), [mutedIds]);
  const postsById = useMemo(() => new Map(posts.map((post) => [post.id, post])), [posts]);
  const authors = new Map(profiles.map((profile) => [profile.id, profile]));
  addUnblockedProfiles(authors, activePage.profiles, blocked);
  const pageOptions = {
    removedPostIds,
    blockedIds: blocked,
    mutedIds: muted,
    postsById,
    reposts,
    viewerId: user?.id ?? null,
  };
  const clientEveryone = publicTimeline(homePosts, homeReposts, profiles);
  const everyone = paging ? presentPagedItems(forYouPage.items, pageOptions) : clientEveryone;
  const feed = paging ? presentPagedItems(followingPage.items, pageOptions) : followedFeed;
  const visible = !user ? (lane === "following" ? [] : everyone) : lane === "following" ? feed : everyone;
  const feedEntries =
    lane === "foryou"
      ? presentForYouFeed(visible)
      : visible.map((item) => ({ kind: "post" as const, item }));
  const activeLoading = paging && activePage.loading && visible.length === 0;
  const followingEmpty =
    Boolean(user) &&
    lane === "following" &&
    !activeLoading &&
    !activePage.error &&
    visible.length === 0;
  // The server-drawn first screen holds only what a phone shows. The rest of
  // the page joins below it a few rows per idle moment once the snapshot is
  // in, so no single commit has to lay out the whole page.
  const rowLimit = useProgressiveRows(feedEntries.length, {
    enabled: Boolean(seed),
    step: SEEDED_ENTRIES,
    hold: seededScreen,
  });
  const shownEntries = feedEntries.slice(0, rowLimit);
  const moreRows = rowLimit < feedEntries.length;
  const feedKeys = Array.from(feedEntries, (entry) => (entry.kind === "whats-new" ? entry.key : entry.item.key));
  const newAbove = useNewPostsAbove({ lane, keys: feedKeys });
  // Only posts that arrive after the feed is on screen fade in. A feed that
  // is already there on mount (Back from a post) shows at once.
  const entranceDelay = useEntranceDelays(feedKeys, true);

  useEffect(() => {
    if (!ready || !cardsReady || !user) return;
    if (pickedFor.current === user.id) return;
    pickedFor.current = user.id;
    setLaneState(
      defaultHomeTab({
        followingCount: followingCount(user.id),
        cardCount: cards.length,
      }),
    );
  }, [cards.length, cardsReady, followingCount, ready, user]);

  function openCollectors() {
    const section = document.getElementById("collectors-to-follow");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    router.push("/search");
  }

  if (!ready) {
    return (
      <PullToRefresh
        onRefresh={async () => {
          await refresh();
          setRefreshKey((key) => key + 1);
        }}
        className="-mx-4 -mt-5"
      >
        <TimelineSkeleton />
      </PullToRefresh>
    );
  }

  // The tabs sit outside the pull-to-refresh content, so a pull moves only the
  // feed and the header and tabs stay together. The wrapper spans the whole
  // feed, so the tabs stay stuck all the way down.
  return (
    <div className="-mx-4 -mt-5">
      {seededScreen && seed && started.visible ? (
        <script dangerouslySetInnerHTML={{ __html: getStartedHintScript(seed.viewer.id, seed.newNow) }} />
      ) : null}
      {user && started.visible && !onboardingBusy ? (
        <GetStartedCard
          state={started}
          followingCount={following}
          onDismiss={dismiss}
          onFollow={openCollectors}
        />
      ) : null}
      {showAddToHome && user ? <AddToHomeTip userId={user.id} /> : null}
      {showWelcome ? <HomeFirstCardPrompt afterGetStarted={welcomeAfterGetStarted} /> : null}
      {postCardValuesMessage ? (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {postCardValuesMessage}
        </p>
      ) : null}

      <div ref={laneStartRef} aria-hidden="true" />
      <LaneTabs lane={lane} onChange={switchLane} />
      <PullToRefresh onRefresh={refreshFeeds}>
        {hasNewPosts || newAbove.show ? (
          <NewPostsPill
            onClick={() => {
              if (hasNewPosts) void refreshFeeds();
              newAbove.dismiss();
            }}
          />
        ) : null}

        {lane === "foryou" ? movingToday ?? <MovingToday /> : null}

        {user ? (
          <Composer onPosted={() => void refreshFeeds()} />
        ) : (
          <SignedOutBanner />
        )}

        {suggestionRail.length > 0 && !followingEmpty ? (
          <CollectorSuggestions profiles={suggestionRail} />
        ) : null}

        <div id="home-lane-panel" role="tabpanel" aria-labelledby={`lane-tab-${lane}`}>
          {activeLoading ? (
            <PostSkeletonList count={3} />
          ) : followingEmpty ? (
            <FollowingEmpty profiles={suggestionRail} />
          ) : activePage.error && visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-rose-600 dark:text-rose-400">
              {activePage.error}
            </p>
          ) : visible.length === 0 && !showWelcome ? (
            <EmptyState
              icon={<Compass className="h-5 w-5" />}
              title="No posts yet"
              detail={
                lane === "following"
                  ? "Log in to see posts from people you follow."
                  : "When collectors post, they'll show up here."
              }
            >
              {user ? (
                <Link href="/compose" className={solidButton}>
                  Post something
                </Link>
              ) : (
                <Link href={loginPath(pathname)} className={solidButton}>
                  Log in
                </Link>
              )}
            </EmptyState>
          ) : (
            <>
              {shownEntries.map((entry, index) => {
                const whoToFollow = whoToFollowAfter(index, inlineSuggestions);
                const inline = whoToFollow.length ? <WhoToFollowCard profiles={whoToFollow} /> : null;
                if (entry.kind === "whats-new") {
                  const noteAuthor = authors.get(entry.items[0]?.post.authorId ?? "") ?? null;
                  return (
                    <Fragment key={entry.key}>
                      <FeedItem itemKey={entry.key} delay={entranceDelay(entry.key)}>
                        <WhatsNewCard items={entry.items} author={noteAuthor} />
                      </FeedItem>
                      {inline}
                    </Fragment>
                  );
                }
                const item = entry.item;
                const author = authors.get(item.post.authorId);
                if (!author) return inline ? <Fragment key={item.key}>{inline}</Fragment> : null;
                return (
                  <Fragment key={item.key}>
                    <FeedItem itemKey={item.key} delay={entranceDelay(item.key)}>
                      <Tweet
                        post={item.post}
                        author={author}
                        repostedBy={item.repostedBy}
                        extraPosts={activePage.relatedPosts}
                        extraProfiles={activePage.profiles}
                        firstScreen={index < FIRST_SCREEN_POSTS}
                      />
                    </FeedItem>
                    {inline}
                  </Fragment>
                );
              })}
              {paging && !seededScreen && !moreRows ? (
                <LoadMore
                  hasMore={activePage.hasMore}
                  loading={activePage.loadingMore}
                  failed={Boolean(activePage.error)}
                  onLoadMore={activePage.loadMore}
                />
              ) : null}
              {activePage.error ? (
                <p className="px-4 py-3 text-center text-sm text-rose-600 dark:text-rose-400">
                  {activePage.error}
                </p>
              ) : null}
            </>
          )}
        </div>
      </PullToRefresh>
    </div>
  );
}

/** An invite for signed-out readers, in brand purple. */
function SignedOutBanner() {
  const pathname = usePathname() || "/";
  return (
    <div className="border-b border-zinc-200/70 px-4 py-4 dark:border-white/[0.07]">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] p-4 text-white">
        <p className="font-mono text-[11px] font-semibold tracking-wider text-white/70 uppercase">
          Join the collectors
        </p>
        <p className="mt-1 text-[19px] leading-6 font-extrabold tracking-tight text-balance">
          Track your cards and see what collectors are posting.
        </p>
        <p className="mt-1.5 text-sm leading-5 text-white/80">
          Recent sold prices for your collection, plus pickups and pulls from the hobby.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={signupPath(pathname)}
            className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-bold text-[#5B21B6] transition-transform active:scale-95 motion-reduce:transform-none"
          >
            Sign up
          </Link>
          <Link
            href={loginPath(pathname)}
            className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-white ring-1 ring-white/40 ring-inset hover:bg-white/10"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}

function Composer({ onPosted }: { onPosted?: () => void }) {
  const { createPost, user } = useSocial();
  const { cards, ready: cardsReady, syncError } = useCollection();
  const libraryRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [composePhoto] = useState(() => takeComposePrefill());
  const {
    images,
    limit,
    photoError,
    readingPhoto,
    addFiles,
    removePhoto,
    replaceAll,
    setLimit,
  } = usePostPhotos(readComposerPhoto, composePhoto);
  const photosFull = photoAttachFull(images.length, limit);
  const photoCapHint = photoAttachHint(limit);

  useEffect(() => {
    heldComposePrefill = null;
  }, []);
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    void postsSupportMultipleImages(supabase).then((ok) => {
      if (!cancelled) setLimit(postPhotoLimit(ok));
    });
    return () => {
      cancelled = true;
    };
  }, [setLimit]);
  const [cardId, setCardId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const selected = cards.find((card) => card.id === cardId);
    const card: PublicCard | null = selected
      ? {
          id: selected.id,
          playerName: selected.playerName,
          year: selected.year,
          setBrand: selected.setBrand,
          cardNumber: selected.cardNumber,
          sport: selected.sport,
          photoDataUrl: selected.photoDataUrl,
          accent: selected.accent,
          estimatedSellPrice: selected.estimatedSellPrice,
        }
      : null;
    setSending(true);
    const result = await createPost({
      body,
      imageDataUrl: images[0] ?? null,
      images,
      card,
    });
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setBody("");
    replaceAll([]);
    setCardId("");
    setError(null);
    onPosted?.();
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="hidden gap-3 border-b border-zinc-200/70 px-4 py-3 md:flex dark:border-white/[0.07]"
    >
      {user ? (
        <Avatar
          name={user.displayName}
          image={user.avatarDataUrl}
          accent={user.accent}
          className="h-10 w-10"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <MentionTextarea
          value={body}
          onChange={setBody}
          maxLength={POST_LIMIT}
          rows={2}
          placeholder="What's happening?"
          className="w-full resize-none bg-transparent text-[15px] leading-5 outline-none placeholder:text-zinc-500"
        />
        <ComposePhotoDrafts images={images} onRemove={removePhoto} />
        {readingPhoto ? <p className="mt-2 text-xs text-zinc-500">Reading photo…</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PhotoFileInputs
            libraryRef={libraryRef}
            libraryMultiple
            onPick={() => undefined}
            onPickMany={(files) => void addFiles(files)}
          />
          <button
            type="button"
            disabled={photosFull}
            aria-describedby={photosFull ? "feed-photo-cap" : undefined}
            onClick={() => libraryRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-white/10"
          >
            <ImagePlus className="h-4 w-4" />
            Photo
          </button>
          {photosFull ? (
            <span id="feed-photo-cap" className="text-xs text-zinc-500">
              {photoCapHint}
            </span>
          ) : null}
          {cardsReady && !syncError ? (
            <AttachCardField
              cards={cards}
              value={cardId}
              onChange={setCardId}
              selectClassName="max-w-[180px] rounded-full border border-zinc-200 bg-transparent px-2 py-1 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300"
            />
          ) : (
            <select
              disabled
              value=""
              aria-label="Attach a card"
              className="max-w-[180px] rounded-full border border-zinc-200 bg-transparent px-2 py-1 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300"
            >
              <option value="">Attach a card</option>
            </select>
          )}
          <span className="ml-auto text-xs text-zinc-400">
            {body.length}/{POST_LIMIT}
          </span>
          <button type="submit" disabled={sending || readingPhoto} className={solidButton}>
            Post
          </button>
        </div>
        {photoError ? (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400" role="alert">
            {photoError}
            {photoError === PHOTO_HEIC_ERROR ||
            photoError === POST_PHOTO_LIMIT_ERROR ||
            photoError === POST_PHOTO_SINGLE_ERROR ? null : (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => libraryRef.current?.click()}
                  className="inline-flex min-h-11 items-center font-semibold underline"
                >
                  Try again
                </button>
              </>
            )}
          </p>
        ) : null}
        {error ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
      </div>
    </form>
  );
}
