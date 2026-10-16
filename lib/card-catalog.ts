/** Lightweight local catalog for Add Card autocomplete (no paid API). */

export type CatalogCard = {
  id: string;
  playerName: string;
  year: number;
  setBrand: string;
  cardNumber: string;
  sport: string;
  parallel: string;
};

type CatalogSeed = Omit<CatalogCard, "id">;

const SEEDS: CatalogSeed[] = [
  { playerName: "Victor Wembanyama", year: 2023, setBrand: "Panini Prizm", cardNumber: "136", sport: "Basketball", parallel: "Silver" },
  { playerName: "Victor Wembanyama", year: 2023, setBrand: "Panini Select", cardNumber: "1", sport: "Basketball", parallel: "Base" },
  { playerName: "Victor Wembanyama", year: 2023, setBrand: "Hoops", cardNumber: "277", sport: "Basketball", parallel: "Base" },
  { playerName: "Caitlin Clark", year: 2024, setBrand: "Panini Prizm WNBA", cardNumber: "101", sport: "Basketball", parallel: "Base" },
  { playerName: "Caitlin Clark", year: 2024, setBrand: "Panini Donruss", cardNumber: "1", sport: "Basketball", parallel: "Base" },
  { playerName: "Luka Doncic", year: 2018, setBrand: "Panini Optic", cardNumber: "177", sport: "Basketball", parallel: "Holo" },
  { playerName: "Luka Doncic", year: 2018, setBrand: "Panini Prizm", cardNumber: "280", sport: "Basketball", parallel: "Silver" },
  { playerName: "Stephen Curry", year: 2009, setBrand: "Topps", cardNumber: "321", sport: "Basketball", parallel: "Base" },
  { playerName: "LeBron James", year: 2003, setBrand: "Topps Chrome", cardNumber: "111", sport: "Basketball", parallel: "Refractor" },
  { playerName: "Anthony Edwards", year: 2020, setBrand: "Panini Prizm", cardNumber: "258", sport: "Basketball", parallel: "Silver" },
  { playerName: "Paolo Banchero", year: 2022, setBrand: "Panini Prizm", cardNumber: "249", sport: "Basketball", parallel: "Silver" },
  { playerName: "Chet Holmgren", year: 2022, setBrand: "Panini Prizm", cardNumber: "236", sport: "Basketball", parallel: "Silver" },
  { playerName: "Ja Morant", year: 2019, setBrand: "Panini Prizm", cardNumber: "249", sport: "Basketball", parallel: "Silver" },
  { playerName: "Zion Williamson", year: 2019, setBrand: "Panini Prizm", cardNumber: "248", sport: "Basketball", parallel: "Silver" },
  { playerName: "Jayson Tatum", year: 2017, setBrand: "Panini Prizm", cardNumber: "16", sport: "Basketball", parallel: "Silver" },
  { playerName: "Michael Jordan", year: 1986, setBrand: "Fleer", cardNumber: "57", sport: "Basketball", parallel: "Base" },
  { playerName: "Shohei Ohtani", year: 2018, setBrand: "Topps Update", cardNumber: "US1", sport: "Baseball", parallel: "Base" },
  { playerName: "Shohei Ohtani", year: 2018, setBrand: "Topps Chrome", cardNumber: "150", sport: "Baseball", parallel: "Refractor" },
  { playerName: "Shohei Ohtani", year: 2024, setBrand: "Topps Series 1", cardNumber: "1", sport: "Baseball", parallel: "Base" },
  { playerName: "Aaron Judge", year: 2017, setBrand: "Topps Chrome", cardNumber: "169", sport: "Baseball", parallel: "Refractor" },
  { playerName: "Aaron Judge", year: 2017, setBrand: "Topps Update", cardNumber: "US200", sport: "Baseball", parallel: "Base" },
  { playerName: "Elly De La Cruz", year: 2024, setBrand: "Topps Chrome", cardNumber: "2", sport: "Baseball", parallel: "Refractor" },
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
  { playerName: "Caleb Williams", year: 2024, setBrand: "Panini Prizm", cardNumber: "301", sport: "Football", parallel: "Silver" },
  { playerName: "Jayden Daniels", year: 2024, setBrand: "Panini Prizm", cardNumber: "389", sport: "Football", parallel: "Silver" },
  { playerName: "Joe Burrow", year: 2020, setBrand: "Panini Prizm", cardNumber: "307", sport: "Football", parallel: "Silver" },
  { playerName: "Josh Allen", year: 2018, setBrand: "Panini Prizm", cardNumber: "205", sport: "Football", parallel: "Silver" },
  { playerName: "Lamar Jackson", year: 2018, setBrand: "Panini Prizm", cardNumber: "212", sport: "Football", parallel: "Silver" },
  { playerName: "C.J. Stroud", year: 2023, setBrand: "Panini Prizm", cardNumber: "339", sport: "Football", parallel: "Silver" },
  { playerName: "Travis Hunter", year: 2025, setBrand: "Panini Prizm", cardNumber: "1", sport: "Football", parallel: "Silver" },
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
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const CARD_CATALOG: CatalogCard[] = SEEDS.map((card) => ({
  ...card,
  id: slug([card.playerName, String(card.year), card.setBrand, card.cardNumber, card.parallel]),
}));

type Ranked = { card: CatalogCard; score: number };

function searchable(card: CatalogCard) {
  return [
    card.playerName,
    String(card.year),
    card.setBrand,
    card.cardNumber,
    card.sport,
    card.parallel,
  ]
    .join(" ")
    .toLowerCase();
}

/** Ranked local matches for player, year, set, or card number. */
export function searchCatalog(query: string, limit = 8): CatalogCard[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 1) return [];

  const tokens = needle.split(/\s+/).filter(Boolean);
  const ranked: Ranked[] = [];

  for (const card of CARD_CATALOG) {
    const hay = searchable(card);
    if (!tokens.every((token) => hay.includes(token))) continue;

    const player = card.playerName.toLowerCase();
    const set = card.setBrand.toLowerCase();
    const year = String(card.year);
    let score = 100;

    if (player === needle) score = 0;
    else if (player.startsWith(needle)) score = 1;
    else if (player.includes(needle)) score = 2;
    else if (year === needle || year.startsWith(needle)) score = 3;
    else if (set.startsWith(needle) || set.includes(needle)) score = 4;
    else score = 5;

    // Prefer shorter titles when scores tie (more specific hits feel better).
    score += Math.min(hay.length / 200, 1);
    ranked.push({ card, score });
  }

  ranked.sort((a, b) => a.score - b.score || a.card.playerName.localeCompare(b.card.playerName));
  return ranked.slice(0, limit).map((item) => item.card);
}

export function catalogLabel(card: CatalogCard) {
  const parallel = card.parallel && card.parallel !== "Base" ? ` · ${card.parallel}` : "";
  return `${card.year} ${card.setBrand} ${card.playerName} #${card.cardNumber}${parallel}`;
}
