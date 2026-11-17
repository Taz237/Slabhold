import type { Metadata } from "next";
import { CatalogFeed } from "@/components/catalog-feed";
import { readFeedPage } from "@/lib/catalog-feed/load";
import { mixFeed, EMPTY_TASTE, parseFeedFilters, type FeedPage } from "@/lib/catalog-feed/feed";
import { CATALOG_TITLE } from "@/lib/public-catalog/query";
import { getAuthUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;

export const metadata: Metadata = {
  title: CATALOG_TITLE,
  description: "Every public card on Slabhold, one at a time. Swipe through new pickups and popular cards.",
};

/**
 * The Slabhold Catalog: every public card, never a private one, one per
 * screen. ?tab= and ?sport= keep the view shareable. Following needs the
 * viewer, so only that tab reads who is looking.
 */
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: SearchValue; sport?: SearchValue }>;
}) {
  const filters = parseFeedFilters(await searchParams);
  const viewerId = filters.tab === "following" ? await getAuthUserId().catch(() => null) : null;
  const page = await readFeedPage(filters, 0, viewerId).catch((): FeedPage => ({ cards: [], nextOffset: null }));
  const initial = filters.tab === "for-you" ? { ...page, cards: mixFeed(page.cards, EMPTY_TASTE, new Set()) } : page;
  return <CatalogFeed initial={initial} initialFilters={filters} />;
}
