import type { Metadata } from "next";
import { CardForm } from "@/components/card-form";
import { catalogCardFromParams } from "@/lib/search/catalog-results";
import { addCardQuery } from "@/lib/search/recent";
import { addAnotherPrefill, copyCardPrefill } from "@/lib/cards/added-panel";

export const metadata: Metadata = { title: "Add a card · Slabhold" };

type SearchValue = string | string[] | undefined;

type Props = {
  searchParams: Promise<{
    q?: SearchValue;
    pick?: SearchValue;
    player?: SearchValue;
    year?: SearchValue;
    set?: SearchValue;
    num?: SearchValue;
    nonumber?: SearchValue;
    parallel?: SearchValue;
    sport?: SearchValue;
    rookie?: SearchValue;
  }>;
};

function one(value: SearchValue): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function NewCardPage({ searchParams }: Props) {
  const params = await searchParams;
  const initialQuery = addCardQuery(one(params.q));
  const initialCatalog = catalogCardFromParams({
    pick: one(params.pick),
    player: one(params.player),
    year: one(params.year),
    set: one(params.set),
    num: one(params.num),
    parallel: one(params.parallel),
    sport: one(params.sport),
    rookie: one(params.rookie),
  });
  // "Add another" keeps sport, player, year and set. "Copy this card" also keeps
  // the card number. A Search pick wins over both.
  const kept = {
    pick: one(params.pick),
    player: one(params.player),
    year: one(params.year),
    set: one(params.set),
  };
  const initialPrefill = initialCatalog
    ? null
    : (copyCardPrefill({ ...kept, num: one(params.num), nonumber: one(params.nonumber) }) ??
      addAnotherPrefill(kept));
  return (
    <CardForm
      guided
      initialQuery={initialQuery}
      initialCatalog={initialCatalog}
      initialSport={one(params.sport)}
      initialPrefill={initialPrefill}
    />
  );
}
