"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useSocial } from "@/components/social-provider";
import { EmptyState, LoadingRows } from "@/components/status";
import { HunterSettingSwitch } from "@/components/hunter-setting";
import { LeaderboardOptInSwitch } from "@/components/leaderboard-opt-in";
import { loginPath } from "@/lib/auth/safe-next";
import { unblockAccount, unmuteAccount } from "@/lib/safety/actions";

export function PrivacyLists() {
  const pathname = usePathname() || "/";
  const { ready, user, blockedIds, mutedIds, safetyAccounts, applySafetyChange, refresh } =
    useSocial();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!ready) {
    return (
      <div className="-mx-4 -mt-5">
        <LoadingRows />
      </div>
    );
  }

  if (!user) {
    return (
      <EmptyState title="Privacy & safety" detail="Log in to manage blocked and muted accounts.">
        <Link href={loginPath(pathname)} className="text-sm font-bold">
          Log in
        </Link>
      </EmptyState>
    );
  }

  const byId = new Map(safetyAccounts.map((profile) => [profile.id, profile]));
  const blocked = blockedIds
    .map((id) => byId.get(id))
    .filter((profile) => profile != null);
  const muted = mutedIds.map((id) => byId.get(id)).filter((profile) => profile != null);

  async function unblock(userId: string) {
    setBusyId(userId);
    setError(null);
    const result = await unblockAccount(userId);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applySafetyChange({ type: "unblock", userId });
    await refresh();
  }

  async function unmute(userId: string) {
    setBusyId(userId);
    setError(null);
    const result = await unmuteAccount(userId);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applySafetyChange({ type: "unmute", userId });
    await refresh();
  }

  return (
    <div className="-mx-4 -mt-5">
      <div className="flex items-center gap-3 border-b border-zinc-200 px-2 py-2 dark:border-white/10">
        <Link
          href="/more"
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold">Privacy & safety</h1>
      </div>
      <HunterSettingSwitch />
      <LeaderboardOptInSwitch />
      {error ? <p className="px-4 pt-3 text-sm text-rose-600">{error}</p> : null}
      <AccountList
        title="Blocked accounts"
        empty="You haven't blocked anyone."
        people={blocked}
        action="Unblock"
        busyId={busyId}
        onAction={(id) => void unblock(id)}
      />
      <AccountList
        title="Muted accounts"
        empty="You haven't muted anyone."
        people={muted}
        action="Unmute"
        busyId={busyId}
        onAction={(id) => void unmute(id)}
      />
      <p className="px-4 py-4 text-sm text-zinc-500">
        <Link href="/terms" className="font-bold underline">
          Terms
        </Link>
      </p>
    </div>
  );
}

function AccountList({
  title,
  empty,
  people,
  action,
  busyId,
  onAction,
}: {
  title: string;
  empty: string;
  people: { id: string; username: string; displayName: string; avatarDataUrl: string | null; accent: string }[];
  action: string;
  busyId: string | null;
  onAction: (id: string) => void;
}) {
  return (
    <section className="border-b border-zinc-200 px-4 py-4 dark:border-white/10">
      <h2 className="text-sm font-bold">{title}</h2>
      {people.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-200 dark:divide-white/10">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-3 py-3">
              <Avatar
                name={person.displayName}
                image={person.avatarDataUrl}
                accent={person.accent}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{person.displayName}</p>
                <p className="truncate text-sm text-zinc-500">@{person.username}</p>
              </div>
              <button
                type="button"
                disabled={busyId === person.id}
                onClick={() => onAction(person.id)}
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-bold disabled:opacity-50 dark:border-white/20"
              >
                {action}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
