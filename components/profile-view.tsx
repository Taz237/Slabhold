"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageCircle, WalletCards } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { outlineButton, solidButton } from "@/components/button-styles";
import { CardThumb } from "@/components/card-thumb";
import { ProfileEditSheet } from "@/components/profile-edit-sheet";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { EmptyState, ProfileSkeleton } from "@/components/status";
import { FollowButton } from "@/components/follow-button";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { Tweet } from "@/components/tweet";
import { money } from "@/lib/format";
import { normalizeUsername } from "@/lib/social/local-db";
import type { PublicCard } from "@/lib/social/types";

export function ProfileView({ username }: { username?: string }) {
  const router = useRouter();
  const social = useSocial();
  const { cards, reload } = useCollection();
  const { ready, user, posts, publicCards, followerCount, followingCount, refresh } = social;

  const profile = username ? social.profileByUsername(username) : user;
  const isOwn = Boolean(profile && user && profile.id === user.id);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"posts" | "collection">("posts");

  if (!ready) return <ProfileSkeleton />;

  if (!username && !user) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <EmptyState
          title="Your profile"
          detail="Sign in to post, follow collectors, and share cards from your book."
        >
          <Link href="/login" className={solidButton}>
            Log in
          </Link>
          <Link href="/login?tab=signup" className={outlineButton}>
            Sign up
          </Link>
        </EmptyState>
      </div>
    );
  }

  if (!profile) {
    return (
      <EmptyState
        title={`No collector named @${username}`}
        detail={
          social.mode === "supabase"
            ? "That profile isn't on Slabhold."
            : "That profile isn't on this device."
        }
      >
        <Link href="/" className="text-sm font-bold">
          Back to Timeline
        </Link>
      </EmptyState>
    );
  }

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
        }))
    : [];
  const listed = publicCards.filter((card) => card.ownerId === profile.id);
  const seen = new Set(
    listed.map((card) => `${card.year}|${card.playerName}|${card.cardNumber}`.toLowerCase()),
  );
  const collection = [
    ...listed,
    ...sharedFromBook.filter((card) => {
      const key = `${card.year}|${card.playerName}|${card.cardNumber}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];
  const activity = posts.filter((post) => post.authorId === profile.id);

  return (
    <>
    <PullToRefresh
      disabled={editing}
      onRefresh={async () => {
        await refresh();
        reload();
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
          {isOwn ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`${outlineButton} mb-1`}
            >
              Edit profile
            </button>
          ) : (
            <div className="mb-1">
              <FollowButton userId={profile.id} />
            </div>
          )}
        </div>
        <h1 className="mt-3 text-xl font-bold tracking-tight">{profile.displayName}</h1>
        <p className="text-[15px] text-zinc-500">@{profile.username}</p>
        {profile.bio ? <p className="mt-3 text-[15px] leading-5">{profile.bio}</p> : null}
        <p className="mt-3 text-sm">
          <span className="font-bold">{followingCount(profile.id)}</span>{" "}
          <span className="text-zinc-500">Following</span>
          <span className="ml-4 font-bold">{followerCount(profile.id)}</span>{" "}
          <span className="text-zinc-500">Followers</span>
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
        activity.length === 0 ? (
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
          activity.map((post) => <Tweet key={post.id} post={post} author={profile} />)
        )
      ) : (
        <div className="px-4 py-4">
          {isOwn ? (
            <p className="mb-3 text-xs text-zinc-500">
              Your book stays on this device.{" "}
              <Link href="/collection" className="underline">
                Open collection
              </Link>{" "}
              and mark a card public to show it here.
            </p>
          ) : null}
          {collection.length === 0 ? (
            <EmptyState
              compact
              icon={<WalletCards className="h-5 w-5" />}
              title="No public cards yet"
              detail={
                isOwn
                  ? "Cards you mark public will show up here."
                  : "Cards this collector shares will show up here."
              }
            >
              {isOwn ? (
                <Link href="/cards/new" className={solidButton}>
                  Add a card
                </Link>
              ) : null}
            </EmptyState>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {collection.map((card) => (
                <li
                  key={card.id}
                  className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10"
                >
                  <CardThumb card={card} className="h-36 w-full" />
                  <div className="px-2.5 py-2">
                    <p className="truncate text-sm font-bold">{card.playerName}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {card.year} {card.setBrand}
                    </p>
                    <p className="text-xs text-zinc-500">Est. {money(card.estimatedSellPrice)}</p>
                  </div>
                </li>
              ))}
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
            router.replace(`/u/${nextUsername}`);
          }
        }}
      />
    ) : null}
    </>
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
