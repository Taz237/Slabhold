"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CardThumb } from "@/components/card-thumb";
import { useCollection } from "@/components/collection-provider";
import { ProfileSkeleton } from "@/components/status";
import { useSocial } from "@/components/social-provider";
import { ValueChart } from "@/components/value-chart";
import { cardTitle, money } from "@/lib/format";
import type { PublicCard } from "@/lib/social/types";

export function PublicCardView({ username, id }: { username: string; id: string }) {
  const social = useSocial();
  const { cards, ready: cardsReady } = useCollection();
  const profile = social.profileByUsername(username);
  const isOwn = Boolean(profile && social.user && profile.id === social.user.id);

  if (!social.ready || (isOwn && !cardsReady)) return <ProfileSkeleton />;

  const backHref = `/u/${username}?tab=collection`;

  if (!profile) {
    return (
      <Missing
        title="Profile not found"
        detail="That collector isn't on Slabhold."
        href="/"
        label="Back to Timeline"
      />
    );
  }

  const owned = isOwn ? cards.find((card) => card.id === id) : undefined;
  const listed = social.publicCards.find((card) => card.id === id && card.ownerId === profile.id);
  const card = owned ? (owned.isPublic ? toPublicCard(owned) : null) : (listed ?? null);

  if (!card) {
    return (
      <Missing
        title="This card isn't public"
        detail="Only cards the collector has shared on their profile can be opened here."
        href={backHref}
        label={`Back to ${profile.displayName}`}
      />
    );
  }

  const specs = [
    card.sport ? { label: "Sport", value: card.sport } : null,
    card.cardNumber.trim() && card.cardNumber.trim() !== "—"
      ? { label: "No.", value: `#${card.cardNumber.trim()}` }
      : null,
    card.parallel?.trim() ? { label: "Parallel", value: card.parallel.trim() } : null,
    card.grade?.trim() ? { label: "Grade", value: card.grade.trim() } : null,
  ].filter((spec): spec is { label: string; value: string } => Boolean(spec));
  const showPaid = typeof card.purchasePrice === "number";
  const showChart = card.estimatedSellPrice > 0;

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {profile.displayName}
      </Link>

      <CardThumb
        card={card}
        className="mx-auto h-96 w-64 rounded-2xl object-cover shadow-xl shadow-black/20"
      />

      <div>
        <p className="text-sm text-zinc-500">{cardTitle(card)}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{card.playerName}</h1>
        {specs.length > 0 ? (
          <dl className="mt-3 flex flex-wrap gap-2">
            {specs.map((spec) => (
              <div
                key={spec.label}
                className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 dark:border-white/10 dark:bg-white/5"
              >
                <dt className="text-[10px] tracking-wide text-zinc-500 uppercase">{spec.label}</dt>
                <dd className="text-sm font-semibold">{spec.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <section className={`grid gap-3 ${showPaid ? "grid-cols-2" : "grid-cols-1"}`}>
        <Metric label="Estimated value" value={money(card.estimatedSellPrice, true)} />
        {showPaid ? <Metric label="Paid" value={money(card.purchasePrice ?? 0, true)} /> : null}
      </section>

      {showChart ? (
        <ValueChart
          card={{
            id: card.id,
            estimatedSellPrice: card.estimatedSellPrice,
            purchasePrice: card.purchasePrice ?? 0,
          }}
        />
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <h2 className="font-semibold">Recent eBay sales</h2>
        <p className="mt-2 text-sm leading-5 text-zinc-500">
          Sold listings for this card will show up here once eBay comps are connected.
        </p>
      </section>
    </div>
  );
}

function toPublicCard(card: {
  id: string;
  playerName: string;
  year: number;
  setBrand: string;
  cardNumber: string;
  sport: string;
  photoDataUrl: string | null;
  accent: string;
  estimatedSellPrice: number;
  grade: string;
  parallel: string;
  purchasePrice: number;
}): PublicCard {
  return {
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
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-[11px] tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

function Missing({
  title,
  detail,
  href,
  label,
}: {
  title: string;
  detail: string;
  href: string;
  label: string;
}) {
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-sm text-zinc-500">{detail}</p>
      <Link href={href} className="mt-4 inline-flex min-h-11 items-center text-sm font-bold">
        {label}
      </Link>
    </div>
  );
}
