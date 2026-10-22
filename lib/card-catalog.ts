/** Local catalog seeds for Add Card search (fallback + migration source). */

import {
  buildSearchText,
  formatCatalogResultLabel,
  searchCardsLocal,
  type SearchableCard,
} from "@/lib/card-search-query";

export type CatalogCard = {
  id: string;
  playerName: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  sport: string;
  parallel: string;
  /** From card_catalog.is_rookie. Seeds that omit it are not rookies. */
  isRookie?: boolean;
};

type CatalogSeed = Omit<CatalogCard, "id">;

function seasonLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function yearForSport(year: number, sport: string): string {
  if (sport === "Basketball" || sport === "Hockey") return seasonLabel(year);
  return String(year);
}

/** Raw seeds: year is calendar start year; converted to year_label by sport. */
const RAW: Array<{
  playerName: string;
  year: number;
  setBrand: string;
  cardNumber: string;
  sport: string;
  parallel: string;
  isRookie?: boolean;
}> = [
  { playerName: "Victor Wembanyama", year: 2023, setBrand: "Panini Prizm", cardNumber: "136", sport: "Basketball", parallel: "Silver" },
  { playerName: "Victor Wembanyama", year: 2023, setBrand: "Panini Select", cardNumber: "87", sport: "Basketball", parallel: "Base" },
  { playerName: "Victor Wembanyama", year: 2023, setBrand: "Hoops", cardNumber: "277", sport: "Basketball", parallel: "Base", isRookie: true },
  { playerName: "Caitlin Clark", year: 2024, setBrand: "Panini Prizm WNBA", cardNumber: "101", sport: "Basketball", parallel: "Base" },
  { playerName: "Caitlin Clark", year: 2024, setBrand: "Panini Donruss", cardNumber: "1", sport: "Basketball", parallel: "Base" },
  { playerName: "Luka Dončić", year: 2018, setBrand: "Panini Optic", cardNumber: "177", sport: "Basketball", parallel: "Holo" },
  { playerName: "Luka Dončić", year: 2018, setBrand: "Panini Prizm", cardNumber: "280", sport: "Basketball", parallel: "Silver" },
  { playerName: "Stephen Curry", year: 2009, setBrand: "Topps", cardNumber: "321", sport: "Basketball", parallel: "Base" },
  { playerName: "LeBron James", year: 2003, setBrand: "Topps Chrome", cardNumber: "111", sport: "Basketball", parallel: "Refractor" },
  { playerName: "Anthony Edwards", year: 2020, setBrand: "Panini Prizm", cardNumber: "258", sport: "Basketball", parallel: "Silver" },
  { playerName: "Paolo Banchero", year: 2022, setBrand: "Panini Prizm", cardNumber: "249", sport: "Basketball", parallel: "Silver" },
  { playerName: "Chet Holmgren", year: 2022, setBrand: "Panini Prizm", cardNumber: "236", sport: "Basketball", parallel: "Silver" },
  { playerName: "Ja Morant", year: 2019, setBrand: "Panini Prizm", cardNumber: "249", sport: "Basketball", parallel: "Silver" },
  { playerName: "Zion Williamson", year: 2019, setBrand: "Panini Prizm", cardNumber: "248", sport: "Basketball", parallel: "Silver" },
  { playerName: "Jayson Tatum", year: 2017, setBrand: "Panini Prizm", cardNumber: "16", sport: "Basketball", parallel: "Silver" },
  { playerName: "Michael Jordan", year: 1986, setBrand: "Fleer", cardNumber: "57", sport: "Basketball", parallel: "Base" },
  { playerName: "Shai Gilgeous-Alexander", year: 2023, setBrand: "Panini Prizm", cardNumber: "230", sport: "Basketball", parallel: "Base" },
  { playerName: "Giannis Antetokounmpo", year: 2013, setBrand: "Panini Prizm", cardNumber: "290", sport: "Basketball", parallel: "Base" },
  { playerName: "Kevin Durant", year: 2007, setBrand: "Topps", cardNumber: "2", sport: "Basketball", parallel: "Base" },
  { playerName: "Nikola Jokic", year: 2015, setBrand: "Panini Prizm", cardNumber: "335", sport: "Basketball", parallel: "Base" },
  { playerName: "Shohei Ohtani", year: 2018, setBrand: "Topps Update", cardNumber: "US1", sport: "Baseball", parallel: "Base" },
  { playerName: "Shohei Ohtani", year: 2018, setBrand: "Topps Chrome", cardNumber: "150", sport: "Baseball", parallel: "Refractor" },
  { playerName: "Shohei Ohtani", year: 2024, setBrand: "Topps Series 1", cardNumber: "1", sport: "Baseball", parallel: "Base" },
  { playerName: "Aaron Judge", year: 2017, setBrand: "Topps Chrome", cardNumber: "169", sport: "Baseball", parallel: "Refractor" },
  { playerName: "Aaron Judge", year: 2017, setBrand: "Topps Update", cardNumber: "US200", sport: "Baseball", parallel: "Base" },
  { playerName: "Elly De La Cruz", year: 2024, setBrand: "Topps Chrome", cardNumber: "44", sport: "Baseball", parallel: "Refractor", isRookie: true },
  { playerName: "Paul Skenes", year: 2024, setBrand: "Topps Update", cardNumber: "US50", sport: "Baseball", parallel: "Base" },
  { playerName: "Bobby Witt Jr.", year: 2022, setBrand: "Bowman Chrome", cardNumber: "BCP-1", sport: "Baseball", parallel: "Refractor" },
  { playerName: "Ronald Acuna Jr.", year: 2018, setBrand: "Topps Update", cardNumber: "US250", sport: "Baseball", parallel: "Base" },
  { playerName: "Juan Soto", year: 2018, setBrand: "Topps Update", cardNumber: "US300", sport: "Baseball", parallel: "Base" },
  { playerName: "Mike Trout", year: 2011, setBrand: "Topps Update", cardNumber: "US175", sport: "Baseball", parallel: "Base" },
  { playerName: "Ken Griffey Jr.", year: 1989, setBrand: "Upper Deck", cardNumber: "1", sport: "Baseball", parallel: "Base" },
  { playerName: "Patrick Mahomes", year: 2017, setBrand: "Panini Prizm", cardNumber: "269", sport: "Football", parallel: "Silver" },
  { playerName: "Patrick Mahomes", year: 2017, setBrand: "Panini Optic", cardNumber: "177", sport: "Football", parallel: "Holo" },
  { playerName: "Justin Herbert", year: 2020, setBrand: "Panini Prizm", cardNumber: "325", sport: "Football", parallel: "Green" },
  { playerName: "Justin Herbert", year: 2020, setBrand: "Panini Optic", cardNumber: "153", sport: "Football", parallel: "Holo" },
  { playerName: "Caleb Williams", year: 2024, setBrand: "Panini Prizm", cardNumber: "301", sport: "Football", parallel: "Silver", isRookie: true },
  { playerName: "Jayden Daniels", year: 2024, setBrand: "Panini Prizm", cardNumber: "347", sport: "Football", parallel: "Silver", isRookie: true },
  { playerName: "Joe Burrow", year: 2020, setBrand: "Panini Prizm", cardNumber: "307", sport: "Football", parallel: "Silver" },
  { playerName: "Josh Allen", year: 2018, setBrand: "Panini Prizm", cardNumber: "205", sport: "Football", parallel: "Silver" },
  { playerName: "Lamar Jackson", year: 2018, setBrand: "Panini Prizm", cardNumber: "212", sport: "Football", parallel: "Silver" },
  { playerName: "C.J. Stroud", year: 2023, setBrand: "Panini Prizm", cardNumber: "339", sport: "Football", parallel: "Silver" },
  { playerName: "Travis Hunter", year: 2025, setBrand: "Panini Prizm", cardNumber: "301", sport: "Football", parallel: "Silver", isRookie: true },
  { playerName: "Jaxson Dart", year: 2025, setBrand: "Panini Prizm", cardNumber: "332", sport: "Football", parallel: "Base", isRookie: true },
  { playerName: "Connor Bedard", year: 2023, setBrand: "Upper Deck", cardNumber: "201", sport: "Hockey", parallel: "Base" },
  { playerName: "Connor Bedard", year: 2023, setBrand: "Upper Deck Series 2", cardNumber: "451", sport: "Hockey", parallel: "Base" },
  { playerName: "Connor McDavid", year: 2015, setBrand: "Upper Deck", cardNumber: "201", sport: "Hockey", parallel: "Base" },
  { playerName: "Auston Matthews", year: 2016, setBrand: "Upper Deck", cardNumber: "201", sport: "Hockey", parallel: "Base" },
  { playerName: "Sidney Crosby", year: 2005, setBrand: "Upper Deck", cardNumber: "201", sport: "Hockey", parallel: "Base" },
  { playerName: "Wayne Gretzky", year: 1979, setBrand: "O-Pee-Chee", cardNumber: "18", sport: "Hockey", parallel: "Base" },
  { playerName: "Lionel Messi", year: 2023, setBrand: "Topps Chrome", cardNumber: "1", sport: "Soccer", parallel: "Refractor" },
  { playerName: "Cristiano Ronaldo", year: 2023, setBrand: "Topps Chrome", cardNumber: "150", sport: "Soccer", parallel: "Refractor" },
  { playerName: "Erling Haaland", year: 2023, setBrand: "Topps Chrome", cardNumber: "50", sport: "Soccer", parallel: "Refractor" },
];

function slug(parts: string[]) {
  return parts
    .join("-")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toSeed(row: (typeof RAW)[number]): CatalogSeed {
  return {
    playerName: row.playerName,
    yearLabel: yearForSport(row.year, row.sport),
    setBrand: row.setBrand,
    cardNumber: row.cardNumber,
    sport: row.sport,
    parallel: row.parallel,
    ...(row.isRookie ? { isRookie: true } : {}),
  };
}

/** Original seeds plus Base row when only a parallel exists for that identity. */
function withBaseVersions(seeds: CatalogSeed[]): CatalogSeed[] {
  const key = (c: CatalogSeed) =>
    [c.playerName, c.yearLabel, c.setBrand, c.cardNumber].join("|").toLowerCase();
  const byKey = new Map<string, CatalogSeed[]>();
  for (const seed of seeds) {
    const k = key(seed);
    const list = byKey.get(k) ?? [];
    list.push(seed);
    byKey.set(k, list);
  }
  const out = [...seeds];
  for (const [, list] of byKey) {
    const hasBase = list.some((c) => c.parallel.toLowerCase() === "base");
    if (!hasBase && list[0]) {
      out.push({ ...list[0], parallel: "Base" });
    }
  }
  return out;
}

const SEEDS: CatalogSeed[] = withBaseVersions(RAW.map(toSeed));

export const CARD_CATALOG: CatalogCard[] = SEEDS.map((card) => ({
  ...card,
  id: slug([
    card.playerName,
    card.yearLabel,
    card.setBrand,
    card.cardNumber,
    card.parallel,
  ]),
}));

export function toSearchableCard(card: CatalogCard): SearchableCard {
  return {
    id: card.id,
    player: card.playerName,
    yearLabel: card.yearLabel,
    setName: card.setBrand,
    cardNumber: card.cardNumber,
    parallel: card.parallel,
    sport: card.sport,
    isRookie: card.isRookie === true,
    searchText: buildSearchText({
      player: card.playerName,
      yearLabel: card.yearLabel,
      setName: card.setBrand,
      cardNumber: card.cardNumber,
    }),
  };
}

function cardsInRankOrder(
  query: string,
  cards: CatalogCard[],
  limit: number,
): CatalogCard[] {
  const hits = searchCardsLocal(query, cards.map(toSearchableCard), limit);
  const byId = new Map(cards.map((card) => [card.id, card]));
  return hits
    .map((hit) => byId.get(hit.id))
    .filter((card): card is CatalogCard => Boolean(card));
}

/** Ranked local matches (typo/alias aware). Default 20 for Add Card. */
export function searchCatalog(query: string, limit = 20): CatalogCard[] {
  return cardsInRankOrder(query, CARD_CATALOG, limit);
}

/**
 * Rank rows from search_cards with the same rules as the local catalog.
 * Built-in seeds are used only when the remote search errors, times out
 * (remote is null), or returns no rows. A non-empty remote list is re-ranked
 * on its own, so a stale seed number is not shown next to the database row.
 */
export function resolveCatalogSearch(
  query: string,
  remote: CatalogCard[] | null,
  limit = 20,
): CatalogCard[] {
  if (remote == null || remote.length === 0) return searchCatalog(query, limit);
  return cardsInRankOrder(query, remote, limit);
}

export function catalogLabel(card: CatalogCard) {
  return formatCatalogResultLabel({
    player: card.playerName,
    yearLabel: card.yearLabel,
    setName: card.setBrand,
    cardNumber: card.cardNumber,
    parallel: card.parallel,
  });
}

/** SQL value list for migrations / tooling. */
export function catalogSeedRows(): Array<{
  player: string;
  year_label: string;
  set_name: string;
  card_number: string;
  parallel: string;
  sport: string;
}> {
  return SEEDS.map((c) => ({
    player: c.playerName,
    year_label: c.yearLabel,
    set_name: c.setBrand,
    card_number: c.cardNumber,
    parallel: c.parallel,
    sport: c.sport,
  }));
}
