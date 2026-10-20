"use client";

import Link from "next/link";
import { CardForm } from "@/components/card-form";
import { useCollection } from "@/components/collection-provider";

export function EditCardPage({ id }: { id: string }) {
  const { getCard, ready } = useCollection();
  const card = getCard(id);

  if (!ready) return <div className="h-64 animate-pulse rounded-2xl bg-white/5" />;
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
