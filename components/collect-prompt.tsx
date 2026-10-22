"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FollowButton } from "@/components/follow-button";
import { Avatar } from "@/components/avatar";
import {
  NameSearch,
  SportChips,
  toggleName,
  toggleSport,
  useCollectSports,
  withoutName,
} from "@/components/collect-editor";
import { useSocial } from "@/components/social-provider";
import {
  collectPromptVisible,
  collectStepAfter,
  interestWriteRows,
  interestsAnswered,
  persistInterestRows,
  schemaMissing,
  type CollectStep,
  type InterestLoad,
  type InterestRow,
} from "@/lib/social/collect-interests";
import type { CollectInterest } from "@/lib/social/follow-rank";
import { loadServerSuggestions, SUGGESTION_DISPLAY_LIMIT } from "@/lib/social/load-suggestions";
import type { ServerSuggestion } from "@/lib/social/suggestion-order";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const footerButton =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-bold";

async function readInterests(userId: string): Promise<InterestLoad> {
  const supabase = createSupabaseBrowser();
  if (!supabase) return { status: "missing" };
  const { data, error } = await supabase
    .from("profile_interests")
    .select("kind, value")
    .eq("user_id", userId);
  if (error) {
    if (!schemaMissing(error)) console.warn("profile_interests", error.message);
    return { status: "missing" };
  }
  return {
    status: "ready",
    rows: ((data ?? []) as { kind?: string; value?: string }[])
      .filter((row) => row.kind && row.value)
      .map((row) => ({ kind: row.kind, value: row.value }) as InterestRow),
  };
}

async function writeInterests(
  userId: string,
  rows: InterestRow[],
): Promise<"saved" | "missing" | "error"> {
  const supabase = createSupabaseBrowser();
  if (!supabase) return "missing";
  return persistInterestRows(supabase, userId, rows);
}

export function CollectPrompt() {
  const pathname = usePathname() || "/";
  const { user, suggestions, refreshSuggestions, followMany } = useSocial();
  const [load, setLoad] = useState<InterestLoad>({ status: "loading" });
  const [step, setStep] = useState<CollectStep>("sports");
  const [sports, setSports] = useState<string[]>([]);
  const [names, setNames] = useState<CollectInterest[]>([]);
  const [catalogSports, setCatalogSports] = useState<string[]>([]);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<ServerSuggestion[] | null>(null);
  const sportOptions = useCollectSports(catalogSports);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void readInterests(user.id).then((next) => {
      if (!cancelled) setLoad(next);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const visible =
    !closed &&
    collectPromptVisible({
      signedIn: Boolean(user),
      table: load.status,
      answered: load.status === "ready" ? interestsAnswered(load.rows) : false,
      pathname,
    });

  useEffect(() => {
    if (!visible) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    void supabase
      .from("card_catalog")
      .select("sport")
      .limit(400)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setCatalogSports(
          (data as { sport?: string | null }[])
            .map((row) => row.sport ?? "")
            .filter(Boolean),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!visible || !user) return null;

  async function finish(action: "skip" | "complete") {
    setBusy(true);
    const picks = [
      ...sports.map((value) => ({ kind: "sport" as const, value })),
      ...names,
    ];
    const rows =
      action === "skip" ? interestWriteRows("skip", picks) : interestWriteRows("complete", picks);
    const result = await writeInterests(user!.id, rows);
    setBusy(false);
    if (result === "missing" || result === "error") {
      setClosed(true);
      return;
    }
    refreshSuggestions();
    if (action === "skip") {
      setClosed(true);
      return;
    }
    const supabase = createSupabaseBrowser();
    if (supabase) {
      const ranked = await loadServerSuggestions(supabase);
      if (ranked) setPeople(ranked);
    }
    setStep("people");
  }

  function go(action: "next" | "back" | "skip" | "done") {
    const next = collectStepAfter(step, action);
    if (next.type === "skip") {
      void finish("skip");
      return;
    }
    if (next.type === "done") {
      setClosed(true);
      return;
    }
    if (next.step === "people" && step === "names") {
      void finish("complete");
      return;
    }
    setStep(next.step);
  }

  const shownPeople = (
    people ??
    suggestions.map((profile) => ({
      userId: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarDataUrl,
      accent: profile.accent,
      reason: profile.suggestionReason,
      score: 0,
    }))
  ).slice(0, SUGGESTION_DISPLAY_LIMIT);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 dark:border-white/10">
        <p className="text-xs font-medium text-zinc-500">
          {step === "sports" ? "1 of 3" : step === "names" ? "2 of 3" : "3 of 3"}
        </p>
        {step === "people" ? (
          <button type="button" onClick={() => go("done")} className="min-h-11 px-2 text-sm font-semibold">
            Done
          </button>
        ) : (
          <button
            type="button"
            onClick={() => go("skip")}
            disabled={busy}
            className="min-h-11 px-2 text-sm font-semibold text-zinc-500"
          >
            Skip
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
        {step === "sports" ? (
          <>
            <h2 className="text-2xl font-bold tracking-tight">What do you collect?</h2>
            <p className="mt-2 text-sm text-zinc-500">Pick a sport or two. You can change this later.</p>
            <div className="mt-5">
              <SportChips
                sports={sportOptions}
                selected={sports}
                onToggle={(sport) => setSports((current) => toggleSport(current, sport))}
              />
            </div>
          </>
        ) : null}
        {step === "names" ? (
          <>
            <h2 className="text-2xl font-bold tracking-tight">Teams and players</h2>
            <p className="mt-2 text-sm text-zinc-500">Search your favorites. One is enough.</p>
            <div className="mt-5">
              <NameSearch
                sports={sports}
                selected={names}
                onAdd={(hit) => setNames((current) => toggleName(current, hit))}
                onRemove={(hit) => setNames((current) => withoutName(current, hit))}
              />
            </div>
          </>
        ) : null}
        {step === "people" ? (
          <>
            <h2 className="text-2xl font-bold tracking-tight">Collectors to follow</h2>
            <p className="mt-2 text-sm text-zinc-500">People who collect and post about the same things.</p>
            <ul className="mt-4 divide-y divide-zinc-200 dark:divide-white/10">
              {shownPeople.map((profile) => (
                <li key={profile.userId} className="flex items-center gap-3 py-3">
                  <Avatar
                    name={profile.displayName}
                    image={profile.avatarUrl}
                    accent={profile.accent || "#7c5cff"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{profile.displayName}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {profile.reason || `@${profile.username}`}
                    </p>
                  </div>
                  <FollowButton userId={profile.userId} />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <footer className="flex gap-2 border-t border-zinc-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/10">
        {step !== "sports" ? (
          <button
            type="button"
            onClick={() => go("back")}
            className={`${footerButton} border border-zinc-300 dark:border-white/15`}
          >
            Back
          </button>
        ) : null}
        {step === "people" ? (
          <button
            type="button"
            disabled={busy || shownPeople.length === 0}
            onClick={() => void followMany(shownPeople.map((profile) => profile.userId))}
            className={`${footerButton} bg-zinc-900 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950`}
          >
            Follow all
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => go("next")}
            className={`${footerButton} bg-zinc-900 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950`}
          >
            {step === "names" ? "See collectors" : "Next"}
          </button>
        )}
      </footer>
    </div>
  );
}
