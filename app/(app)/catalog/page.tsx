import type { Metadata } from "next";
import { CatalogView } from "@/components/catalog-page";
import { getMovingToday } from "@/lib/moving-today/load";
import { shouldShowMovingToday, type MovingTodayPayload } from "@/lib/moving-today/types";
import { readCatalogPage } from "@/lib/public-catalog/load";
import { CATALOG_TITLE, catalogFiltersActive, parseCatalogFilters, type CatalogPage } from "@/lib/public-catalog/query";
import { getAuthUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;

export const metadata: Metadata = {
  title: CATALOG_TITLE,
  description: "Every public card on Slabhold, newest first. Search by player or set.",
};

/**
 * Every public card, never a private one. ?sport=, ?sort= and ?q= keep the
 * view shareable and restore it on Back. The movers row reads the same
 * cached list the old Moving today page did.
 */
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: SearchValue; sort?: SearchValue; q?: SearchValue }>;
}) {
  const filters = parseCatalogFilters(await searchParams);
  const [page, movers] = await Promise.all([
    readCatalogPage(filters, 0).catch((): CatalogPage => ({ tiles: [], nextOffset: 0 })),
    getMovingToday().catch((): MovingTodayPayload | null => null),
  ]);
  // Only the empty state needs to know who is looking.
  const empty = page.tiles.length === 0 && page.nextOffset == null && !catalogFiltersActive(filters);
  const signedIn = empty ? Boolean(await getAuthUserId().catch(() => null)) : false;
  return (
    <CatalogView
      initial={page}
      initialFilters={filters}
      movers={movers && shouldShowMovingToday(movers.sales) ? movers : null}
      signedIn={signedIn}
    />
  );
}
