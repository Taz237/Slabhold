"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, WalletCards } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { solidButton } from "@/components/button-styles";
import { useCollection } from "@/components/collection-provider";
import { goBack } from "@/components/nav-motion";
import { OpenToOffersFilter } from "@/components/open-to-offers";
import { ProfileCardGrid } from "@/components/profile-card-grid";
import { ProfileCardsSkeleton } from "@/components/profile/profile-cards-skeleton";
import { useProfileCards } from "@/components/profile/use-profile-cards";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { ReadRetry } from "@/components/read-retry";
import { useSocial } from "@/components/social-provider";
import { EmptyState } from "@/components/status";
import { filterOpenToOffers, openToOffersFilterAvailable } from "@/lib/offers/open-to-offers";
import { sortSpotlightCards } from "@/lib/profile/spotlight";
import { useProfiles } from "@/lib/social/use-profiles";
import { userHref } from "@/lib/social/user-href";
import { useCardValues } from "@/lib/value/use-card-values";

/**
 * /u/<handle>/cards: the grid that was the profile's Cards tab, on its own
 * page. Public cards only, with est. values, the Open to offers filter and
 * its badges, in the carousel's order (most valuable first). The owner still
 * sees the hint that cards are private by default.
 */
export function ProfileCardsView({ username }: { username: string }) {
  const router = useRouter();
  const social = useSocial();
  const { ready, user, refresh } = social;
  const { ready: cardsReady, reload } = useCollection();
  const profile = social.profileByUsername(username);
  // Someone the snapshot didn't bring is read by handle before "not found".
  const profileRead = useProfiles(profile ? null : { usernames: [username] });
  const isOwn = Boolean(profile && user && profile.id === user.id);
  const [offersOnly, setOffersOnly] = useState(false);
  const { collection, loaded, reload: reloadCards } = useProfileCards(profile);
  const collectionIds = useMemo(() => collection.map((card) => card.id), [collection]);
  const { values: cardValues } = useCardValues(collectionIds);
  const sorted = useMemo(() => sortSpotlightCards(collection, cardValues), [collection, cardValues]);
  const offersAvailable = openToOffersFilterAvailable(collection);
  const shownCollection = useMemo(
    () => filterOpenToOffers(sorted, offersOnly && offersAvailable),
    [offersAvailable, offersOnly, sorted],
  );

  if (!profile && profileRead.failed) return <ReadRetry title="Couldn't load this profile" onRetry={profileRead.retry} />;
  if (!ready || (!profile && !profileRead.ready)) return <ProfileCardsSkeleton />;
  if (!profile) {
    return (
      <EmptyState title={`No collector named @${username}`} detail="That profile isn't on Slabhold.">
        <Link href="/" className="text-sm font-semibold">
          Back to Home
        </Link>
      </EmptyState>
    );
  }

  const backHref = userHref(profile.username);
  const filtered = offersOnly && collection.length > 0;

  return (
    <PullToRefresh
      onRefresh={async () => {
        reload();
        reloadCards();
        await refresh();
      }}
      className="-mx-4 -mt-5"
    >
      <div data-profile-cards="" className="min-w-0 overflow-x-hidden">
        <div className="flex min-h-[3.75rem] items-center gap-1 border-b border-zinc-200 px-2 dark:border-white/10">
          <button
            type="button"
            // Back to the profile you came from. Opened cold, the profile is where this goes.
            onClick={() => goBack({ to: backHref, push: (href) => router.push(href) })}
            data-nav-href={backHref}
            data-nav-back=""
            aria-label="Back to profile"
            className="hit-44 grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar
            name={profile.displayName}
            image={profile.avatarDataUrl}
            accent={profile.accent}
            expandable={false}
            className="ml-1 h-8 w-8 shrink-0 text-11"
          />
          <h1 className="ml-1.5 min-w-0 flex-1 truncate text-17 leading-6 font-semibold">
            @{profile.username}&apos;s cards
          </h1>
          {loaded ? (
            <p className="shrink-0 pr-2 font-mono text-13 text-zinc-500 tabular-nums" aria-label={`${collection.length} public ${collection.length === 1 ? "card" : "cards"}`}>
              {collection.length}
            </p>
          ) : (
            <span aria-hidden className="mr-2 inline-block h-4 w-6 shrink-0 skeleton-shimmer rounded" />
          )}
        </div>

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
          {!loaded ? (
            <ProfileCardsGridSkeleton />
          ) : shownCollection.length === 0 ? (
            <EmptyState
              compact
              icon={<WalletCards className="h-5 w-5" />}
              title={filtered ? "No cards open to offers" : "No public cards yet"}
              detail={
                filtered
                  ? "None of these public cards are open to offers."
                  : isOwn
                    ? "Cards you mark public will show up here."
                    : "Cards this collector shares will show up here."
              }
            >
              {isOwn && !filtered ? (
                <Link href="/cards/new" className={solidButton}>
                  Add a card
                </Link>
              ) : null}
            </EmptyState>
          ) : (
            <ProfileCardGrid cards={shownCollection} username={profile.username} values={cardValues} />
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}

function ProfileCardsGridSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="p-1">
          <div className="aspect-[3/5] w-full skeleton-shimmer rounded-xl" />
          <div className="mt-2 h-3.5 w-3/4 skeleton-shimmer rounded-full" />
        </div>
      ))}
    </div>
  );
}
