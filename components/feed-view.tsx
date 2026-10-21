"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Compass, ImagePlus, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { MentionTextarea } from "@/components/mention-textarea";
import { solidButton } from "@/components/button-styles";
import { FollowButton } from "@/components/follow-button";
import { useCollection } from "@/components/collection-provider";
import { AddToHomeTip } from "@/components/add-to-home-tip";
import { FirstCardWelcome } from "@/components/first-card-welcome";
import { GetStartedCard, useGetStartedDismissed, useRememberNewUser } from "@/components/get-started";
import { useSocial } from "@/components/social-provider";
import { LoadMore } from "@/components/load-more";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { usePagedTimeline } from "@/components/use-paged-timeline";
import { EmptyState, LoadingRows, TimelineSkeleton } from "@/components/status";
import { CollectionToday } from "@/components/collection-today";
import { shouldShowFirstCardWelcome } from "@/lib/collection/welcome";
import { Tweet } from "@/components/tweet";
import { loginPath } from "@/lib/auth/safe-next";
import { takeCompose } from "@/lib/capture";
import { fileToDataUrl } from "@/lib/storage";
import {
  checklistBlocksAddToHomeTip,
  checklistState,
  defaultHomeTab,
  newUserOnFullSnapshot,
  profileStepDone,
} from "@/lib/social/get-started";
import { followingAuthorIds, homeHead, showsNewPosts } from "@/lib/social/feed-page";
import { addUnblockedProfiles, presentPagedItems } from "@/lib/social/paged-items";
import { publicTimeline } from "@/lib/social/timeline";
import { POST_LIMIT, type Profile, type PublicCard } from "@/lib/social/types";

export function FeedView() {
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
    !checklistBlocksAddToHomeTip({
      visible: started.visible,
      complete: started.complete,
      dismissed,
      wasNewUser,
      createdAt: user?.createdAt ?? null,
    });
  const showWelcome =
    Boolean(user) &&
    !started.visible &&
    shouldShowFirstCardWelcome({
      cardCount: cards.length,
      ready: cardsReady,
      syncError,
    });
  const [lane, setLane] = useState<"following" | "foryou">("foryou");
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
  if (ready && user && suggestionIds.current === null && suggestions.length > 0) {
    suggestionIds.current = suggestions.map((profile) => profile.id);
  }
  const suggestionRail = (suggestionIds.current ?? suggestions.map((profile) => profile.id))
    .map((id) => profiles.find((profile) => profile.id === id))
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
  const activeLoading = paging && activePage.loading && visible.length === 0;
  const followingEmpty =
    Boolean(user) &&
    lane === "following" &&
    !activeLoading &&
    !activePage.error &&
    visible.length === 0;

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
      {user && started.visible ? (
        <GetStartedCard
          state={started}
          followingCount={following}
          onDismiss={dismiss}
          onFollow={openCollectors}
        />
      ) : null}
      {showAddToHome && user ? <AddToHomeTip userId={user.id} /> : null}
      {showWelcome ? <FirstCardWelcome /> : user ? <CollectionToday /> : null}
      {postCardValuesMessage ? (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {postCardValuesMessage}
        </p>
      ) : null}

      <div className="grid grid-cols-2 border-b border-zinc-200 text-[15px] dark:border-white/10">
        <LaneTab active={lane === "foryou"} onClick={() => setLane("foryou")}>
          For You
        </LaneTab>
        <LaneTab active={lane === "following"} onClick={() => setLane("following")}>
          Following
        </LaneTab>
      </div>

      {user ? (
        <Composer onPosted={() => setRefreshKey((key) => key + 1)} />
      ) : (
        <SignedOutBanner />
      )}

      {hasNewPosts ? (
        <div className="sticky top-16 z-10 flex justify-center py-2">
          <button
            type="button"
            onClick={() => {
              setRefreshKey((key) => key + 1);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white shadow dark:bg-white dark:text-zinc-900"
          >
            New posts
          </button>
        </div>
      ) : null}

      {suggestionRail.length > 0 && !followingEmpty ? (
        <CollectorSuggestions profiles={suggestionRail} />
      ) : null}

      <div>
        {activeLoading ? (
          <LoadingRows count={3} />
        ) : followingEmpty ? (
          <EmptyState icon={<Compass className="h-5 w-5" />} title="Follow collectors to fill this feed">
            {suggestionRail.length === 0 ? (
              <Link href="/search" className={solidButton}>
                Find collectors
              </Link>
            ) : null}
          </EmptyState>
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
            {visible.map((item) => {
              const author = authors.get(item.post.authorId);
              if (!author) return null;
              return (
                <Tweet
                  key={item.key}
                  post={item.post}
                  author={author}
                  repostedBy={item.repostedBy}
                  extraPosts={activePage.relatedPosts}
                  extraProfiles={activePage.profiles}
                />
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
      {followingEmpty && suggestionRail.length > 0 ? (
        <CollectorSuggestions profiles={suggestionRail} />
      ) : null}
    </PullToRefresh>
  );
}

function CollectorSuggestions({ profiles }: { profiles: Profile[] }) {
  return (
    <section
      id="collectors-to-follow"
      className="scroll-mt-20 border-b border-zinc-200 px-4 py-3 dark:border-white/10"
    >
      <p className="mb-2 text-xs font-medium text-zinc-500">Collectors to follow</p>
      <div className="flex gap-2 overflow-x-auto pb-1" data-no-pull="">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className="flex w-64 shrink-0 items-center gap-2.5 rounded-2xl border border-zinc-200 p-2.5 dark:border-white/10"
          >
            <Link href={`/u/${profile.username}`}>
              <Avatar name={profile.displayName} image={profile.avatarDataUrl} accent={profile.accent} />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/u/${profile.username}`} className="block truncate text-sm font-bold">
                {profile.displayName}
              </Link>
              <p className="truncate text-xs text-zinc-500">@{profile.username}</p>
            </div>
            <FollowButton userId={profile.id} />
          </div>
        ))}
      </div>
    </section>
  );
}

function LaneTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative py-3.5 font-medium ${active ? "font-bold" : "text-zinc-500"}`}
    >
      {children}
      {active ? (
        <span className="absolute bottom-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-full bg-zinc-900 dark:bg-zinc-100" />
      ) : null}
    </button>
  );
}

function SignedOutBanner() {
  const pathname = usePathname() || "/";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-white/10">
      <p className="text-[15px]">See what collectors are posting.</p>
      <Link href={loginPath(pathname)} className={solidButton}>
        Log in
      </Link>
    </div>
  );
}

function Composer({ onPosted }: { onPosted?: () => void }) {
  const { createPost, user } = useSocial();
  const { cards } = useCollection();
  const fileRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    const captured = takeCompose();
    if (captured) setImage(captured);
  }, []);
  const [cardId, setCardId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onImage(file: File | undefined) {
    if (!file) return;
    setImage(await fileToDataUrl(file, 960));
  }

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
    const result = await createPost({ body, imageDataUrl: image, card });
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setBody("");
    setImage(null);
    setCardId("");
    setError(null);
    onPosted?.();
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="hidden gap-3 border-b border-zinc-200 px-4 py-3 md:flex dark:border-white/10"
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
        {image ? (
          <div className="relative mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt=""
              className="max-h-48 w-full rounded-2xl border border-zinc-200 object-cover dark:border-white/10"
            />
            <button
              type="button"
              onClick={() => setImage(null)}
              aria-label="Remove photo"
              className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onImage(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <ImagePlus className="h-4 w-4" />
            Photo
          </button>
          <select
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            className="max-w-[180px] rounded-full border border-zinc-200 bg-transparent px-2 py-1 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300"
          >
            <option value="">Attach a card</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.year} {card.playerName}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-zinc-400">
            {body.length}/{POST_LIMIT}
          </span>
          <button type="submit" disabled={sending} className={solidButton}>
            Post
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
      </div>
    </form>
  );
}
