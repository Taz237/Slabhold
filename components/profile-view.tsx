"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MessageCircle, WalletCards } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { outlineButton, solidButton } from "@/components/button-styles";
import { CardThumb } from "@/components/card-thumb";
import { OpenToOffersFilter, ProfileCardCaption } from "@/components/open-to-offers";
import { ProfileEditSheet } from "@/components/profile-edit-sheet";
import { LoadMore } from "@/components/load-more";
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
import { ShareIconButton } from "@/components/share-button";
import { Tweet } from "@/components/tweet";
import { normalizeUsername } from "@/lib/social/local-db";
import { ilikeExact } from "@/lib/social/username-taken";
import { addUnblockedProfiles, presentPagedItems } from "@/lib/social/paged-items";
import { profileTimeline } from "@/lib/social/timeline";
import type { PublicCard } from "@/lib/social/types";
import { EbaySoldLink } from "@/components/ebay-sold-link";
import {
  filterOpenToOffers,
  openToOffersFilterAvailable,
} from "@/lib/offers/open-to-offers";
import { ebaySoldSearchUrlForCard } from "@/lib/value/ebay-sold";
import { resolvePriceRead, tilePriceText } from "@/lib/value/price-fallback";
import { useCardValues } from "@/lib/value/use-card-values";

export function ProfileView({ username }: { username?: string }) {
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
    followerCount,
    followingCount,
    refresh,
    blockedIds,
    safetyAccounts,
    applySafetyChange,
    rememberPosts,
    removedPostIds,
  } = social;

  const profile = username ? social.profileByUsername(username) : user;
  const isOwn = Boolean(profile && user && profile.id === user.id);
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [openedEdit, setOpenedEdit] = useState(false);
  const [tab, setTab] = useState<"posts" | "collection">(
    searchParams.get("tab") === "collection" ? "collection" : "posts",
  );
  const [offersOnly, setOffersOnly] = useState(false);
  const [postsRefreshKey, setPostsRefreshKey] = useState(0);
  const pagedPosts = usePagedTimeline({
    enabled: mode === "supabase" && Boolean(profile?.id),
    scope: "profile",
    profileId: profile?.id,
    viewerId: user?.id ?? null,
    refreshKey: postsRefreshKey,
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
          }))
      : [];
    const listed = publicCards.filter((card) => card.ownerId === profile.id);
    const seen = new Set(
      listed.map(
        (card) =>
          `${card.year}|${card.playerName}|${card.cardNumber}`.toLowerCase(),
      ),
    );
    return [
      ...listed,
      ...sharedFromBook.filter((card) => {
        const key =
          `${card.year}|${card.playerName}|${card.cardNumber}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    ];
  }, [cards, isOwn, profile, publicCards]);

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

  if (!profile) {
    return <MissingProfile username={username ?? ""} mode={social.mode} />;
  }

  const blocked = new Set(blockedIds);
  const authors = new Map(profiles.map((person) => [person.id, person]));
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
  const postsLoading = mode === "supabase" && pagedPosts.loading && activity.length === 0;

  return (
    <>
    <PullToRefresh
      disabled={editing}
      onRefresh={async () => {
        await refresh();
        reload();
        setPostsRefreshKey((key) => key + 1);
      }}
      className="-mx-4 -mt-5"
    >
    <div inert={editing ? true : undefined}>
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
              <button type="button" onClick={() => setEditing(true)} className={outlineButton}>
                Edit profile
              </button>
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
        <h1 className="mt-3 text-xl font-bold tracking-tight">{profile.displayName}</h1>
        <p className="text-[15px] text-zinc-500">@{profile.username}</p>
        {profile.bio ? <p className="mt-3 text-[15px] leading-5">{profile.bio}</p> : null}
        <p className="mt-3 flex gap-4 text-sm">
          <CountLink
            href={`${username ? userHref(profile.username) : "/profile"}/following`}
            count={followingCount(profile.id)}
            label="Following"
          />
          <CountLink
            href={`${username ? userHref(profile.username) : "/profile"}/followers`}
            count={followerCount(profile.id)}
            label="Followers"
          />
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 border-b border-zinc-200 text-[15px] dark:border-white/10">
        <ProfileTab active={tab === "posts"} onClick={() => setTab("posts")}>
          Posts
        </ProfileTab>
        <ProfileTab active={tab === "collection"} onClick={() => setTab("collection")}>
          Collection
        </ProfileTab>
      </div>

      {tab === "posts" ? (
        postsLoading ? (
          <LoadingRows count={3} />
        ) : pagedPosts.error && activity.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-rose-600 dark:text-rose-400">
            {pagedPosts.error}
          </p>
        ) : activity.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="h-5 w-5" />}
            title="No posts yet"
            detail={
              isOwn
                ? "Share a pickup, a comp, or what you're holding."
                : "This collector hasn't posted yet."
            }
          >
            {isOwn ? (
              <Link href="/compose" className={solidButton}>
                Post something
              </Link>
            ) : null}
          </EmptyState>
        ) : (
          <>
            {activity.map((item) => {
              const author = authors.get(item.post.authorId);
              if (!author) return null;
              return (
                <Tweet
                  key={item.key}
                  post={item.post}
                  author={author}
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
        )
      ) : (
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
            <ul className="grid grid-cols-2 gap-3">
              {shownCollection.map((card) => {
                const stored = cardValues.get(card.id);
                const ebayHref = ebaySoldSearchUrlForCard(card);
                const priceRead = resolvePriceRead({
                  value: stored,
                  createdAt: "createdAt" in card ? (card.createdAt as string) : null,
                  similar: stored?.similar,
                  ebayHref,
                  card,
                });
                const priceText = tilePriceText(priceRead, true);
                return (
                  <li key={card.id}>
                    <Link
                      href={`${userHref(profile.username)}/cards/${encodeURIComponent(card.id)}`}
                      className="block overflow-hidden rounded-2xl border border-zinc-200 transition hover:border-zinc-300 active:bg-zinc-50 dark:border-white/10 dark:hover:border-white/20 dark:active:bg-white/[0.04]"
                    >
                      <CardThumb card={card} className="h-36 w-full" />
                      <ProfileCardCaption card={card} valueLabel={priceText} />
                    </Link>
                    {priceRead.showEbaySold && ebayHref ? (
                      <p className="px-1 pt-1 text-xs text-zinc-500">
                        <EbaySoldLink href={ebayHref} />
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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

function CountLink({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <Link href={href} className="rounded-md py-1 hover:underline">
      <span className="font-bold">{count}</span> <span className="text-zinc-500">{label}</span>
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
