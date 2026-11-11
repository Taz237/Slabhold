"use client";

import Link from "next/link";
import { CardForm } from "@/components/card-form";
import { useCollection } from "@/components/collection-provider";

export function EditCardPage({ id }: { id: string }) {
  const { getCard, ready } = useCollection();
  const card = getCard(id);

  if (!ready) {
    return (
      <div
        aria-busy="true"
        aria-label="Loading card"
        data-edit-skeleton=""
        className="h-64 rounded-2xl bg-zinc-200/80 motion-safe:animate-pulse dark:bg-white/5"
      />
    );
  }
  if (!card) {
    return (
      <div>
        <p>Card not found.</p>
        <Link href="/collection" className="text-sm text-violet-700 dark:text-violet-300">
          Back
        </Link>
      </div>
    );
  }

  return <CardForm existing={card} />;
}
