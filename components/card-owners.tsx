"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { outlineButton, solidButton } from "@/components/button-styles";
import { useSocial } from "@/components/social-provider";
import { signupPath } from "@/lib/auth/safe-next";
import { userHref } from "@/lib/social/user-href";
import type { IdentityCard } from "@/lib/social/card-identity";
import {
  OWNERS_PAGE_SIZE,
  publicOwnersForCard,
  type CardOwnerRow,
} from "@/lib/social/card-owners";

export function CardOwnersSection({
  card,
  excludeCardId,
}: {
  card: IdentityCard & { id: string };
  excludeCardId?: string;
}) {
  const { ready, user, profiles, publicCards } = useSocial();
  const pathname = usePathname() || "/";
  const [expanded, setExpanded] = useState(false);

  const profilesById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );

  const { owners, total } = useMemo(() => {
    if (!ready) return { owners: [] as CardOwnerRow[], total: 0 };
    return publicOwnersForCard(
      card,
      publicCards.map((item) => ({ ...item, isPublic: true })),
      profilesById,
      {
        excludeCardId: excludeCardId ?? card.id,
        limit: expanded ? 100 : OWNERS_PAGE_SIZE,
      },
    );
  }, [card, excludeCardId, expanded, profilesById, publicCards, ready]);

  if (!ready || total === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold">Owned by</h2>
          <p className="text-xs text-zinc-500">
            Collectors with a public copy of this card
          </p>
        </div>
        {total > OWNERS_PAGE_SIZE && !expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs font-semibold text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
          >
            See all ({total})
          </button>
        ) : null}
      </div>
      <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/10">
        {owners.map((owner) => (
          <OwnerRow
            key={`${owner.ownerId}-${owner.cardId}`}
            owner={owner}
            signedIn={Boolean(user)}
            isSelf={Boolean(user && user.id === owner.ownerId)}
            pathname={pathname}
          />
        ))}
      </ul>
    </section>
  );
}

function OwnerRow({
  owner,
  signedIn,
  isSelf,
  pathname,
}: {
  owner: CardOwnerRow;
  signedIn: boolean;
  isSelf: boolean;
  pathname: string;
}) {
  const profileHref = userHref(owner.username);
  const messageHref = signedIn ? userHref(owner.username, "messages") : signupPath(pathname);

  return (
    <li className="flex items-center gap-3 py-3">
      <Link href={profileHref} className="shrink-0">
        <Avatar
          name={owner.displayName}
          image={owner.avatarDataUrl}
          accent={owner.accent}
          className="h-10 w-10"
          expandable={false}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={profileHref}
          className="block truncate text-sm font-semibold hover:underline"
        >
          @{owner.username}
        </Link>
        <p className="truncate text-xs text-zinc-500">{owner.grade}</p>
      </div>
      {isSelf ? null : (
        <Link
          href={messageHref}
          className={signedIn ? outlineButton : solidButton}
          title={signedIn ? undefined : "Sign up to message"}
        >
          Message
        </Link>
      )}
    </li>
  );
}
