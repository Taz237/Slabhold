"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MessageCircle, WalletCards } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { outlineButton, solidButton } from "@/components/button-styles";
import { OpenToOffersFilter } from "@/components/open-to-offers";
import { ProfileCardGrid } from "@/components/profile-card-grid";
import { ProfileEditSheet } from "@/components/profile-edit-sheet";
import { ProfileBadgeStrip } from "@/components/badges/profile-badge-strip";
import { LoadMore } from "@/components/load-more";
import { MentionText } from "@/components/mention-text";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { usePagedTimeline } from "@/components/use-paged-timeline";
import { EmptyState, LoadingRows, ProfileSkeleton } from "@/components/status";
import { FollowButton } from "@/components/follow-button";
import { SafetyMenu } from "@/components/safety-menu";
import { unblockAccount } from "@/lib/safety/actions";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { loginPath, signupPath } from "@/lib/auth/safe-next";
import { userHref } from "@/lib/social/user-href";
import { publicCardKeys } from "@/lib/social/public-card-cache";
import { useFollowCounts } from "@/lib/social/use-follow-counts";
import { useProfiles } from "@/lib/social/use-profiles";
import { ReadRetry } from "@/components/read-retry";
import { ShareIconButton } from "@/components/share-button";
import { ReplyPhotos } from "@/components/reply-photos";
import { Tweet } from "@/components/tweet";
import { normalizeUsername } from "@/lib/social/local-db";
import { ilikeExact } from "@/lib/social/username-taken";
import { addUnblockedProfiles, presentPagedItems } from "@/lib/social/paged-items";
import { profileTimeline } from "@/lib/social/timeline";
import { loadPostById } from "@/lib/social/load-feed-page";
import {
  PROFILE_TAB_LABELS,
  loadProfilePublicCards,
  profileCardCount,
  profileCardsTab,
  profileMediaItems,
  profileTabFromQuery,
  visibleReplyParentIds,
  withPinnedFirst,
  type ProfileTab,
} from "@/lib/social/profile-tabs";
import type { OwnedCard, Post, PublicCard } from "@/lib/social/types";
import {
  filterOpenToOffers,
  openToOffersFilterAvailable,
} from "@/lib/offers/open-to-offers";
import { useCardValues } from "@/lib/value/use-card-values";
import type { ProfileBadges } from "@/lib/badges/load";
import type { ServerCardCount } from "@/lib/social/profile-card-count";
import { InviteButton } from "@/components/invite/invite-button";
import { ShareCollectionCard } from "@/components/invite/share-collection-card";

export function ProfileView({
  username,
  badges = null,
  cardCount: serverCardCount = null,
}: {
  username?: string;
  /** Read on the server, so the strip never pops in after the header. */
  badges?: ProfileBadges | null;
  /** Read on the server, so Cards never shows 0 while the lists load. */
  cardCount?: ServerCardCount | null;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const social = useSocial();
  const { cards, reload, ready: cardsReady } = useCollection();
  const {
    ready,
    mode,
    user,
    posts,
    reposts,
    profiles,
    publicCards,
    requestPublicCards,
    refresh,
    blockedIds,
    safetyAccounts,
    applySafetyChange,
    rememberPosts,
    removedPostIds,
    repliesBy,
  } = social;

  const profile = username ? social.profileByUsername(username) : user;
  // Someone the snapshot didn't bring is read by handle before "not found".
  const profileRead = useProfiles(username && !profile ? { usernames: [username] } : null);
  const counts = useFollowCounts(profile?.id ?? null);
  const isOwn = Boolean(profile && user && profile.id === user.id);
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [openedEdit, setOpenedEdit] = useState(false);
  const [tab, setTab] = useState<ProfileTab>(() => profileTabFromQuery(searchParams.get("tab")));
  const [offersOnly, setOffersOnly] = useState(false);
  const [viewCards, setViewCards] = useState<{ ownerId: string; rows: OwnedCard[] } | null>(null);
  const [pinnedExtra, setPinnedExtra] = useState<Post | null>(null);
  /** Bumped by pull to refresh. Reloads the shown cards; posts refresh in place. */
  const [postsRefreshKey, setPostsRefreshKey] = useState(0);
  const [replyParents, setReplyParents] = useState<{ key: string; ids: ReadonlySet<string> } | null>(
    null,
  );
  const pagedPosts = usePagedTimeline({
    enabled: mode === "supabase" && Boolean(profile?.id),
    scope: "profile",
    profileId: profile?.id,
    viewerId: user?.id ?? null,
    refreshKey: 0,
    rememberPosts,
  });

  const collection = useMemo(() => {
    if (!profile) return [] as PublicCard[];
    const sharedFromBook: PublicCard[] = isOwn
      ? cards
          .filter((card) => card.isPublic)
          .map((card) => ({
            id: card.id,
            playerName: card.playerName,
            year: card.year,
            setBrand: card.setBrand,
            cardNumber: card.cardNumber,
            sport: card.sport,
            photoDataUrl: card.photoDataUrl,
            accent: card.accent,
            estimatedSellPrice: card.estimatedSellPrice,
            grade: card.grade,
            parallel: card.parallel,
            purchasePrice: card.purchasePrice,
            openToOffers: card.openToOffers ?? null,
            ownerId: profile.id,
            isPublic: true,
          }))
      : [];
    const listed =
      viewCards && viewCards.ownerId === profile.id
        ? viewCards.rows
        : publicCards.filter((card) => card.ownerId === profile.id);
    return profileCardsTab({
      ownerId: profile.id,
      viewerId: user?.id ?? null,
      publicCards: listed,
      ownBook: sharedFromBook,
    });
  }, [cards, isOwn, profile, publicCards, user?.id, viewCards]);

  const offersAvailable = openToOffersFilterAvailable(collection);
  const shownCollection = useMemo(
    () => filterOpenToOffers(collection, offersOnly && offersAvailable),
    [collection, offersAvailable, offersOnly],
  );
  const collectionIds = useMemo(
    () => shownCollection.map((card) => card.id),
    [shownCollection],
  );
  const { values: cardValues } = useCardValues(collectionIds);
  const editFromLink = searchParams.get("edit") === "1" && isOwn;
  if (editFromLink && !openedEdit) {
    setOpenedEdit(true);
    setEditing(true);
  }

  const pinTarget =
    profile?.pinnedPostId && !removedPostIds.has(profile.pinnedPostId) ? profile.pinnedPostId : null;
  const pinInMemory = Boolean(
    pinTarget &&
      (posts.some((post) => post.id === pinTarget) ||
        pagedPosts.posts.some((post) => post.id === pinTarget) ||
        pagedPosts.items.some((item) => item.post.id === pinTarget)),
  );

  useEffect(() => {
    const ownerId = profile?.id;
    if (mode !== "supabase" || !ownerId) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    void loadProfilePublicCards(supabase, ownerId)
      .then((rows) => {
        if (!cancelled) setViewCards({ ownerId, rows });
      })
      .catch(() => {
        if (cancelled) return;
        setViewCards(null);
        // The tab then lists this owner's cards from the shared public card read.
        requestPublicCards(publicCardKeys({ ownerId }));
      });
    return () => {
      cancelled = true;
    };
  }, [mode, profile?.id, postsRefreshKey, requestPublicCards]);

  const replyAuthorId = profile?.id ?? "";
  const loadedReplies = replyAuthorId ? repliesBy(replyAuthorId) : [];
  const replyParentKey = loadedReplies.map((reply) => `${reply.id}:${reply.postId}`).join("|");
  const replyParentsReady =
    mode !== "supabase" || loadedReplies.length === 0 || replyParents?.key === replyParentKey;
  const replies = replyParentsReady
    ? mode === "supabase" && replyParents
      ? loadedReplies.filter((reply) => replyParents.ids.has(reply.postId))
      : loadedReplies
    : [];

  useEffect(() => {
    if (mode !== "supabase" || !replyAuthorId || !replyParentKey) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    const ids = replyParentKey.split("|").map((part) => part.slice(part.indexOf(":") + 1));
    let cancelled = false;
    void visibleReplyParentIds(supabase, ids).then((idsVisible) => {
      if (!cancelled) setReplyParents({ key: replyParentKey, ids: idsVisible });
    });
    return () => {
      cancelled = true;
    };
  }, [mode, replyAuthorId, replyParentKey]);

  useEffect(() => {
    const ownerId = profile?.id;
    if (!pinTarget || pinInMemory || mode !== "supabase" || !ownerId) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    void loadPostById(supabase, pinTarget, user?.id ?? null).then((result) => {
      if (cancelled) return;
      const loaded = result?.post;
      if (!loaded || loaded.authorId !== ownerId || loaded.hiddenAt) {
        setPinnedExtra(null);
        return;
      }
      setPinnedExtra(loaded);
      if (result) rememberPosts([loaded, ...result.relatedPosts], result.profiles);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, pinInMemory, pinTarget, profile?.id, rememberPosts, user?.id]);

  if (!ready) return <ProfileSkeleton />;

  if (!username && !user) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <EmptyState
          title="Your profile"
          detail="Sign in to post, follow collectors, and share cards from your book."
        >
          <Link href={loginPath(pathname)} className={solidButton}>
            Log in
          </Link>
          <Link href={signupPath(pathname)} className={outlineButton}>
            Sign up
          </Link>
        </EmptyState>
      </div>
    );
  }

  const blockedProfile = username
    ? safetyAccounts.find(
        (person) =>
          person.id !== user?.id &&
          blockedIds.includes(person.id) &&
          person.username.toLowerCase() === username.toLowerCase(),
      )
    : undefined;

  if (blockedProfile) {
    return (
      <BlockedAccount
        username={blockedProfile.username}
        onUnblock={async () => {
          const result = await unblockAccount(blockedProfile.id);
          if (!result.ok) return result.error;
          applySafetyChange({ type: "unblock", userId: blockedProfile.id });
          await refresh();
          return null;
        }}
      />
    );
  }

  if (!profile && profileRead.failed) return <ReadRetry title="Couldn't load this profile" onRetry={profileRead.retry} />;
  if (!profile && !profileRead.ready) return <ProfileSkeleton />;
  if (!profile) {
    return <MissingProfile username={username ?? ""} mode={social.mode} />;
  }

  const blocked = new Set(blockedIds);
  const authors = new Map(profiles.map((person) => [person.id, person]));
  authors.set(profile.id, profile);
  addUnblockedProfiles(authors, pagedPosts.profiles, blocked);
  const postsById = new Map(posts.map((post) => [post.id, post]));
  const activity =
    mode === "supabase"
      ? presentPagedItems(pagedPosts.items, {
          removedPostIds,
          blockedIds: blocked,
          postsById,
          reposts,
          viewerId: user?.id ?? null,
        })
      : profileTimeline(posts, reposts, profiles, profile.id);
  const pinnedPost = (() => {
    if (!pinTarget) return null;
    const fromActivity = activity.find((item) => item.post.id === pinTarget)?.post;
    const known =
      fromActivity ??
      posts.find((post) => post.id === pinTarget) ??
      pagedPosts.posts.find((post) => post.id === pinTarget) ??
      (pinnedExtra?.id === pinTarget ? pinnedExtra : undefined);
    if (!known || known.authorId !== profile.id || known.hiddenAt) return null;
    return known;
  })();
  const remote = mode === "supabase";
  const cardCount = profileCardCount({
    own: isOwn,
    server:
      serverCardCount && serverCardCount.username.toLowerCase() === profile.username.toLowerCase()
        ? serverCardCount.count
        : null,
    publicLoaded: !remote || viewCards?.ownerId === profile.id ? collection.length : null,
    ownTotal: cardsReady ? cards.length : null,
  });
  // Server badges are for the profile in the URL; a client-side rename drops them.
  const badgeView =
    badges && badges.username.toLowerCase() === profile.username.toLowerCase() ? badges.view : null;
  const shownActivity =
    tab === "media"
      ? profileMediaItems(activity, profile.id)
      : withPinnedFirst(activity, tab === "posts" ? pinnedPost : null, profile);
  const postsLoading = mode === "supabase" && pagedPosts.loading && shownActivity.length === 0;

  return (
    <>
    <PullToRefresh
      disabled={editing}
      onRefresh={async () => {
        reload();
        setPostsRefreshKey((key) => key + 1);
        // The posts list stays on screen while the newest page loads over it.
        await Promise.all([refresh(), pagedPosts.refresh()]);
      }}
      className="-mx-4 -mt-5"
    >
    <div inert={editing ? true : undefined} className="min-w-0 overflow-x-hidden">
      <div className="h-40 overflow-hidden bg-zinc-200 dark:bg-zinc-800">
        {profile.coverDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.coverDataUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(115deg, ${profile.accent}, #18181b 72%)`,
            }}
          />
        )}
      </div>
      <div className="px-4">
        <div className="flex items-end justify-between">
          <Avatar
            name={profile.displayName}
            image={profile.avatarDataUrl}
            accent={profile.accent}
            className="-mt-14 h-24 w-24 text-xl ring-4 ring-[var(--background)]"
          />
          <div className="mb-1 flex max-w-[17rem] flex-wrap items-center justify-end gap-2">
            <ShareIconButton
              path={userHref(profile.username)}
              title={`${profile.displayName} (@${profile.username})`}
              label={`Share ${profile.displayName}`}
            />
            {isOwn ? (
              <>
                <InviteButton username={profile.username} className={outlineButton} />
                <button type="button" onClick={() => setEditing(true)} className={outlineButton}>
                  Edit profile
                </button>
              </>
            ) : (
              <>
                <SafetyMenu
                  targetType="user"
                  targetId={profile.id}
                  reportedUserId={profile.id}
                  username={profile.username}
                />
                <Link
                  href={user ? userHref(profile.username, "messages") : signupPath(pathname)}
                  className={outlineButton}
                >
                  Message
                </Link>
                <FollowButton userId={profile.id} />
              </>
            )}
          </div>
        </div>
        <h1 className="mt-3 text-[22px] leading-7 font-extrabold tracking-tight break-words">
          {profile.displayName}
        </h1>
        <p className="text-[15px] leading-5 font-medium text-zinc-500">@{profile.username}</p>
        {profile.bio ? (
          <p className="mt-2.5 text-[15px] leading-[1.4] break-words text-zinc-800 dark:text-zinc-200">
            {profile.bio}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-1 text-sm">
          <button
            type="button"
            onClick={() => setTab("cards")}
            className="inline-flex min-h-11 items-center gap-1 rounded-md pr-1 hover:underline"
          >
            {cardCount == null ? (
              <span
                className="inline-block h-4 w-5 animate-pulse rounded bg-zinc-200/80 motion-reduce:animate-none dark:bg-white/10"
                aria-hidden
              />
            ) : (
              <span className="font-bold tabular-nums">{cardCount}</span>
            )}
            <span className="text-zinc-500">{cardCount === 1 ? "Card" : "Cards"}</span>
          </button>
          <span aria-hidden className="text-zinc-400 dark:text-zinc-600">
            ·
          </span>
          <CountLink
            href={`${username ? userHref(profile.username) : "/profile"}/followers`}
            count={counts.followers}
            label="Followers"
          />
          <span aria-hidden className="text-zinc-400 dark:text-zinc-600">
            ·
          </span>
          <CountLink
            href={`${username ? userHref(profile.username) : "/profile"}/following`}
            count={counts.following}
            label="Following"
          />
        </div>
        {badgeView ? (
          <ProfileBadgeStrip view={badgeView} badgesHref={`${userHref(profile.username)}/badges`} />
        ) : null}
        {isOwn ? (
          <div className="mt-3">
            <ShareCollectionCard />
          </div>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Profile"
        className="mt-3 grid min-w-0 grid-cols-4 overflow-x-hidden border-b border-zinc-200 text-[13px] min-[400px]:text-[15px] dark:border-white/10"
      >
        {PROFILE_TAB_LABELS.map((item) => (
          <ProfileTab
            key={item.id}
            active={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </ProfileTab>
        ))}
      </div>

      {tab === "replies" ? (
        !replyParentsReady ? (
          <LoadingRows />
        ) : replies.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="h-5 w-5" />}
            title="No replies yet"
            detail={
              isOwn ? "Replies you post will show up here." : "This collector hasn't replied yet."
            }
          />
        ) : (
          <div className="min-w-0">
            {replies.map((reply) => (
              <article
                key={reply.id}
                className="min-w-0 border-b border-zinc-200 px-4 py-3 dark:border-white/10"
              >
                <p className="text-[13px] font-bold text-zinc-500">Reply</p>
                {reply.body.trim() ? (
                  <p className="mt-1 text-[15px] leading-5 break-words whitespace-pre-wrap">
                    <MentionText text={reply.body} />
                  </p>
                ) : null}
                <ReplyPhotos images={reply.images} />
                <Link
                  href={`/posts/${reply.postId}`}
                  className="mt-1 inline-block text-[13px] font-medium text-sky-600 hover:underline dark:text-sky-400"
                >
                  View post
                </Link>
              </article>
            ))}
          </div>
        )
      ) : tab === "cards" ? (
        <div className="px-4 py-4">
          {isOwn && cardsReady && collection.length === 0 ? (
            <p className="mb-3 text-xs text-zinc-500">
              Cards are private by default.{" "}
              <Link href="/collection" className="underline">
                Open collection
              </Link>{" "}
              and mark a card public to show it here.
            </p>
          ) : null}
          <OpenToOffersFilter
            available={offersAvailable}
            active={offersOnly}
            onToggle={() => setOffersOnly((current) => !current)}
          />
          {shownCollection.length === 0 ? (
            <EmptyState
              compact
              icon={<WalletCards className="h-5 w-5" />}
              title={offersOnly && collection.length > 0 ? "No cards open to offers" : "No public cards yet"}
              detail={
                offersOnly && collection.length > 0
                  ? "None of these public cards are open to offers."
                  : isOwn
                    ? "Cards you mark public will show up here."
                    : "Cards this collector shares will show up here."
              }
            >
              {isOwn && !(offersOnly && collection.length > 0) ? (
                <Link href="/cards/new" className={solidButton}>
                  Add a card
                </Link>
              ) : null}
            </EmptyState>
          ) : (
            <ProfileCardGrid
              cards={shownCollection}
              username={profile.username}
              values={cardValues}
            />
          )}
        </div>
      ) : postsLoading ? (
        <LoadingRows count={3} />
      ) : pagedPosts.error && shownActivity.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-rose-600 dark:text-rose-400">
          {pagedPosts.error}
        </p>
      ) : shownActivity.length === 0 ? (
        <>
          <EmptyState
            icon={<MessageCircle className="h-5 w-5" />}
            title={tab === "media" ? "No photos yet" : "No posts yet"}
            detail={
              tab === "media"
                ? isOwn
                  ? "Posts with photos will show up here."
                  : "This collector hasn't posted a photo yet."
                : isOwn
                  ? "Share a pickup, a comp, or what you're holding."
                  : "This collector hasn't posted yet."
            }
          >
            {isOwn && tab === "posts" ? (
              <Link href="/compose" className={solidButton}>
                Post something
              </Link>
            ) : null}
          </EmptyState>
          {mode === "supabase" && tab === "media" ? (
            <LoadMore
              hasMore={pagedPosts.hasMore}
              loading={pagedPosts.loadingMore}
              failed={Boolean(pagedPosts.error)}
              onLoadMore={pagedPosts.loadMore}
            />
          ) : null}
        </>
      ) : (
        <>
          {shownActivity.map((item) => {
            const author = authors.get(item.post.authorId);
            if (!author) return null;
            return (
              <Tweet
                key={item.key}
                post={item.post}
                author={author}
                pinned={item.key.startsWith("pinned:")}
                repostedBy={item.repostedBy}
                extraPosts={pagedPosts.relatedPosts}
                extraProfiles={pagedPosts.profiles}
              />
            );
          })}
          {mode === "supabase" ? (
            <LoadMore
              hasMore={pagedPosts.hasMore}
              loading={pagedPosts.loadingMore}
              failed={Boolean(pagedPosts.error)}
              onLoadMore={pagedPosts.loadMore}
            />
          ) : null}
          {pagedPosts.error ? (
            <p className="px-4 py-3 text-center text-sm text-rose-600 dark:text-rose-400">
              {pagedPosts.error}
            </p>
          ) : null}
        </>
      )}
    </div>
    </PullToRefresh>
    {editing && isOwn ? (
      <ProfileEditSheet
        profile={profile}
        onClose={() => setEditing(false)}
        onSaved={(nextUsername) => {
          setEditing(false);
          if (username && normalizeUsername(username) !== nextUsername) {
            router.replace(userHref(nextUsername));
          }
        }}
      />
    ) : null}
    </>
  );
}

function CountLink({ href, count, label }: { href: string; count: number | null; label: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 hover:underline">
      {count == null ? (
        <span
          className="inline-block h-4 w-5 animate-pulse rounded bg-zinc-200/80 motion-reduce:animate-none dark:bg-white/10"
          aria-hidden
        />
      ) : (
        <span className="font-bold tabular-nums">{count}</span>
      )}
      <span className="text-zinc-500">{label}</span>
    </Link>
  );
}

function BlockedAccount({
  username,
  onUnblock,
}: {
  username: string;
  onUnblock: () => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <EmptyState title={`You've blocked @${username}`} detail="You can't interact with this account.">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onUnblock().then((message) => {
            setBusy(false);
            setError(message);
          });
        }}
        className={outlineButton}
      >
        Unblock
      </button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </EmptyState>
  );
}

function MissingProfile({
  username,
  mode,
}: {
  username: string;
  mode: "local" | "supabase";
}) {
  const [state, setState] = useState<"loading" | "missing" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowser();
    if (!supabase || mode !== "supabase") {
      setState("missing");
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", ilikeExact(username))
        .maybeSingle();
      if (cancelled) return;
      if (!data?.id) {
        setState("missing");
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const me = sessionData.session?.user.id;
      if (!me || data.id === me) {
        setState("missing");
        return;
      }
      const interact = await supabase.rpc("can_interact", { other: data.id as string });
      if (cancelled) return;
      setState(interact.data === false ? "unavailable" : "missing");
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, username]);

  if (state === "loading") return <ProfileSkeleton />;
  if (state === "unavailable") {
    return (
      <EmptyState title="This account isn't available" detail="You can't interact with this account.">
        <Link href="/" className="text-sm font-bold">
          Back to Home
        </Link>
      </EmptyState>
    );
  }
  return (
    <EmptyState
      title={`No collector named @${username}`}
      detail={
        mode === "supabase"
          ? "That profile isn't on Slabhold."
          : "That profile isn't on this device."
      }
    >
      <Link href="/" className="text-sm font-bold">
        Back to Home
      </Link>
    </EmptyState>
  );
}

function ProfileTab({
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative min-w-0 truncate px-1 py-3.5 font-medium ${active ? "font-bold" : "text-zinc-500"}`}
    >
      {children}
      {active ? (
        <span className="absolute bottom-0 left-1/2 h-1 w-8 max-w-[70%] -translate-x-1/2 rounded-full bg-zinc-900 dark:bg-zinc-100" />
      ) : null}
    </button>
  );
}
