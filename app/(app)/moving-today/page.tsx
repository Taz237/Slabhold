import { redirect } from "next/navigation";
import { parseCatalogSport, CATALOG_PATH } from "@/lib/public-catalog/query";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;

/**
 * Moving today became the Slabhold Catalog. Old links land there, keeping a
 * sport filter. The movers now sit in a row at the top of the catalog.
 */
export default async function MovingTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: SearchValue }>;
}) {
  const sport = parseCatalogSport((await searchParams).sport);
  redirect(sport ? `${CATALOG_PATH}?sport=${sport}` : CATALOG_PATH);
}
