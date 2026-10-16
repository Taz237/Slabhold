import { parseGrade, RAW_GRADE } from "./card-options";
import type { SportsCard } from "./types";

function seed(
  partial: Omit<
    SportsCard,
    | "yearLabel"
    | "setIsCustom"
    | "noNumber"
    | "parallelIsCustom"
    | "serialRun"
    | "serialNo"
    | "isRookie"
    | "isAuto"
    | "isRelic"
    | "conditionType"
    | "gradeQualifier"
    | "certNumber"
  > &
    Partial<SportsCard>,
): SportsCard {
  const parsed = parseGrade(partial.grade ?? "");
  const conditionType =
    partial.conditionType ??
    (parsed.company && parsed.company !== RAW_GRADE ? "graded" : "raw");
  return {
    ...partial,
    yearLabel: partial.yearLabel ?? String(partial.year),
    setIsCustom: partial.setIsCustom ?? false,
    noNumber: partial.noNumber ?? false,
    parallel: partial.parallel || "Base",
    parallelIsCustom: partial.parallelIsCustom ?? false,
    serialRun: partial.serialRun ?? null,
    serialNo: partial.serialNo ?? null,
    isRookie: partial.isRookie ?? false,
    isAuto: partial.isAuto ?? false,
    isRelic: partial.isRelic ?? false,
    conditionType,
    gradeQualifier: partial.gradeQualifier ?? "",
    certNumber: partial.certNumber ?? "",
  };
}

export const SEED_CARDS: SportsCard[] = [
  seed({
    id: "wemby-prizm-136",
    playerName: "Victor Wembanyama",
    year: 2023,
    yearLabel: "2023-24",
    setBrand: "Panini Prizm",
    cardNumber: "136",
    grade: "Raw",
    parallel: "Silver",
    sport: "Basketball",
    purchasePrice: 95,
    purchaseDate: "2025-11-02",
    estimatedSellPrice: 185,
    sellPrice: null,
    sellDate: null,
    notes: "Raw, sharp corners. Watching PSA 10 comps before sending.",
    photoDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2025-11-02T14:00:00.000Z",
    updatedAt: "2026-03-12T10:00:00.000Z",
  }),
  seed({
    id: "luka-optic-rr",
    playerName: "Luka Doncic",
    year: 2018,
    yearLabel: "2018-19",
    setBrand: "Donruss Optic Rated Rookie",
    cardNumber: "177",
    grade: "PSA 9",
    parallel: "Holo",
    sport: "Basketball",
    purchasePrice: 420,
    purchaseDate: "2024-08-18",
    estimatedSellPrice: 610,
    sellPrice: null,
    sellDate: null,
    notes: "Holo, centering looks 60/40. Best hold in the book.",
    photoDataUrl: null,
    accent: "#2dd4bf",
    createdAt: "2024-08-18T18:20:00.000Z",
    updatedAt: "2026-02-01T09:00:00.000Z",
  }),
  seed({
    id: "mahomes-prizm",
    playerName: "Patrick Mahomes",
    year: 2017,
    setBrand: "Panini Prizm",
    cardNumber: "269",
    grade: "PSA 10",
    parallel: "Silver",
    sport: "Football",
    purchasePrice: 280,
    purchaseDate: "2025-01-09",
    estimatedSellPrice: 255,
    sellPrice: 255,
    sellDate: "2026-01-21",
    notes: "Flipped after a slow winter. Fees not included.",
    photoDataUrl: null,
    accent: "#f43f5e",
    createdAt: "2025-01-09T12:00:00.000Z",
    updatedAt: "2026-01-21T16:40:00.000Z",
  }),
  seed({
    id: "clark-prizm",
    playerName: "Caitlin Clark",
    year: 2024,
    yearLabel: "2024",
    setBrand: "Panini Prizm WNBA",
    cardNumber: "101",
    grade: "Raw",
    parallel: "Base",
    sport: "Basketball",
    purchasePrice: 140,
    purchaseDate: "2025-06-04",
    estimatedSellPrice: 265,
    sellPrice: null,
    sellDate: null,
    notes: "Base Prizm. Demand still sticky around March Madness comps.",
    photoDataUrl: null,
    accent: "#fbbf24",
    createdAt: "2025-06-04T11:10:00.000Z",
    updatedAt: "2026-04-02T08:00:00.000Z",
  }),
  seed({
    id: "ohtani-update",
    playerName: "Shohei Ohtani",
    year: 2018,
    setBrand: "Topps Update",
    cardNumber: "US1",
    grade: "BGS 9.5",
    parallel: "Base",
    sport: "Baseball",
    purchasePrice: 175,
    purchaseDate: "2025-03-22",
    estimatedSellPrice: 340,
    sellPrice: 355,
    sellDate: "2025-12-11",
    notes: "Sold to a local collector. Clean flip.",
    photoDataUrl: null,
    accent: "#38bdf8",
    createdAt: "2025-03-22T15:00:00.000Z",
    updatedAt: "2025-12-11T19:05:00.000Z",
  }),
  seed({
    id: "herbert-prizm",
    playerName: "Justin Herbert",
    year: 2020,
    setBrand: "Panini Prizm",
    cardNumber: "325",
    grade: "Raw",
    parallel: "Green",
    sport: "Football",
    purchasePrice: 88,
    purchaseDate: "2026-02-14",
    estimatedSellPrice: 72,
    sellPrice: null,
    sellDate: null,
    notes: "Need to move before football season or eat the dip.",
    photoDataUrl: null,
    accent: "#22c55e",
    createdAt: "2026-02-14T13:30:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  }),
];
