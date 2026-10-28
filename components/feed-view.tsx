"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { CollectorSuggestions, FollowingEmpty } from "@/components/collector-suggestions";
import {
  FeedItem,
  LaneTabs,
  NewPostsPill,
  useEntranceDelays,
  useLaneScroll,
  useNewPostsAbove,
  type HomeLane,
} from "@/components/timeline-ui";
import { CollectionToday } from "@/components/collection-today";
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
import { presentForYouFeed } from "@/lib/social/for-you-display";
import { addUnblockedProfiles, presentPagedItems } from "@/lib/social/paged-items";
import { publicTimeline } from "@/lib/social/timeline";
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

export function FeedView({ movingToday }: { movingToday?: ReactNode } = {}) {
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
  const countsReady = Boolean(user) && ready && cardsReady && !syncError;
  const wasNewOnLoad = newUserOnFullSnapshot({
    fullSnapshot: countsReady && (mode !== "supabase" || hasFullSnapshot),
    followingCount: following,
    cardCount: cards.length,
  });
  const wasNewUser = useRememberNewUser(user?.id ?? null, wasNewOnLoad);
  const started = checklistState({
    cardCount: cards.length,
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
    !started.visible &&
    shouldShowFirstCardWelcome({
      cardCount: cards.length,
      ready: cardsReady,
      syncError,
    });
  const [lane, setLane] = useState<HomeLane>("foryou");
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
  const [capturedHead, setCapturedHead] = useState<{ key: number; head: ReturnType<typeof homeHead> } | null>(
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
  });
  if (paging && !forYouPage.loading && (capturedHead === null || capturedHead.key !== refreshKey)) {
    setCapturedHead({ key: refreshKey, head });
  }
  const hasNewPosts =
    paging &&
    capturedHead !== null &&
    capturedHead.key === refreshKey &&
    !forYouPage.loading &&
    showsNewPosts(capturedHead.head, head, user?.id ?? null, removedPostIds);
  const activePage = lane === "following" ? followingPage : forYouPage;
  const pickedFor = useRef<string | null>(null);
  const suggestionIds = useRef<string[] | null>(null);
  if (ready && suggestionsReady && user && suggestionIds.current === null && suggestions.length > 0) {
    suggestionIds.current = suggestions.map((profile) => profile.id);
  }
  const suggestionById = new Map(suggestions.map((profile) => [profile.id, profile]));
  const suggestionRail = (suggestionIds.current ?? (suggestionsReady ? suggestions.map((profile) => profile.id) : []))
    .map((id) => suggestionById.get(id) ?? profiles.find((profile) => profile.id === id))
    .filter((profile) => profile != null);
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
  const feedKeys = Array.from(feedEntries, (entry) => (entry.kind === "whats-new" ? entry.key : entry.item.key));
  const newAbove = useNewPostsAbove({ lane, keys: feedKeys });
  const entranceDelay = useEntranceDelays(feedKeys);

  useEffect(() => {
    if (!ready || !cardsReady || !user) return;
    if (pickedFor.current === user.id) return;
    pickedFor.current = user.id;
    setLane(
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

  return (
    <PullToRefresh
      onRefresh={async () => {
        await refresh();
        setRefreshKey((key) => key + 1);
      }}
      className="-mx-4 -mt-5"
    >
      {user && started.visible && !onboardingBusy ? (
        <GetStartedCard
          state={started}
          followingCount={following}
          onDismiss={dismiss}
          onFollow={openCollectors}
        />
      ) : null}
      {showAddToHome && user ? <AddToHomeTip userId={user.id} /> : null}
      {showWelcome ? <HomeFirstCardPrompt /> : user ? <CollectionToday /> : null}
      {postCardValuesMessage ? (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {postCardValuesMessage}
        </p>
      ) : null}

      <div ref={laneStartRef} aria-hidden="true" />
      <LaneTabs lane={lane} onChange={switchLane} />
      {hasNewPosts || newAbove.show ? (
        <NewPostsPill
          onClick={() => {
            if (hasNewPosts) setRefreshKey((key) => key + 1);
            newAbove.dismiss();
          }}
        />
      ) : null}

      {lane === "foryou" ? movingToday ?? <MovingToday /> : null}

      {user ? (
        <Composer onPosted={() => setRefreshKey((key) => key + 1)} />
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
            {feedEntries.map((entry) => {
              if (entry.kind === "whats-new") {
                const noteAuthor = authors.get(entry.items[0]?.post.authorId ?? "") ?? null;
                return (
                  <FeedItem key={entry.key} itemKey={entry.key} delay={entranceDelay(entry.key)}>
                    <WhatsNewCard items={entry.items} author={noteAuthor} />
                  </FeedItem>
                );
              }
              const item = entry.item;
              const author = authors.get(item.post.authorId);
              if (!author) return null;
              return (
                <FeedItem key={item.key} itemKey={item.key} delay={entranceDelay(item.key)}>
                  <Tweet
                    post={item.post}
                    author={author}
                    repostedBy={item.repostedBy}
                    extraPosts={activePage.relatedPosts}
                    extraProfiles={activePage.profiles}
                  />
                </FeedItem>
              );
            })}
            {paging ? (
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
