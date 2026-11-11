import type { ScanMatch } from "./match";

/**
 * Made-up scan results for the sheet preview (/scan/preview). Real player
 * names on generic cards, no logos, and certs that are not real.
 */

/** A plain card drawn in SVG: a silver frame, a dark panel and a light sweep. No logos or marks. */
export const PREVIEW_PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350">
<defs>
<linearGradient id="frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f4f5"/><stop offset=".45" stop-color="#a1a1aa"/><stop offset=".55" stop-color="#e4e4e7"/><stop offset="1" stop-color="#71717a"/></linearGradient>
<linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f3f46"/><stop offset="1" stop-color="#18181b"/></linearGradient>
<linearGradient id="sweep" x1="0" y1="0" x2="1" y2="1"><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset=".65" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<rect width="250" height="350" rx="14" fill="url(#frame)"/>
<rect x="14" y="14" width="222" height="322" rx="8" fill="url(#panel)"/>
<circle cx="125" cy="140" r="46" fill="#52525b"/>
<path d="M55 300c8-62 44-92 70-92s62 30 70 92z" fill="#52525b"/>
<rect x="14" y="14" width="222" height="322" rx="8" fill="url(#sweep)"/>
<rect x="30" y="296" width="120" height="14" rx="3" fill="#e4e4e7"/>
</svg>`,
)}`;

const SURE = { player: "sure", year: "sure", set: "sure", number: "sure", parallel: "sure" } as const;

export const PREVIEW_SLAB: ScanMatch = {
  catalogId: "preview-luka",
  playerName: "Luka Doncic",
  sport: "Basketball",
  yearLabel: "2018-19",
  setBrand: "Panini Prizm",
  cardNumber: "280",
  parallel: "Silver",
  serialRun: null,
  serialNo: "",
  isRookie: true,
  isAuto: false,
  grade: { company: "PSA", number: "10", qualifier: "", certNumber: "00000000", authentic: false, autoGrade: "" },
  score: 125,
  sureness: SURE,
  parallelOptions: [{ name: "Silver", serialRun: null }],
};

const RAW_OPTIONS = [
  { name: "Base", serialRun: null },
  { name: "Silver", serialRun: null },
  { name: "Red", serialRun: 299 },
  { name: "Blue", serialRun: 199 },
  { name: "Purple", serialRun: 99 },
  { name: "Gold", serialRun: 10 },
];

export const PREVIEW_RAW: ScanMatch[] = [
  {
    catalogId: "preview-wemby-prizm",
    playerName: "Victor Wembanyama",
    sport: "Basketball",
    yearLabel: "2023-24",
    setBrand: "Panini Prizm",
    cardNumber: "136",
    parallel: "",
    serialRun: null,
    serialNo: "",
    isRookie: true,
    isAuto: false,
    grade: null,
    score: 83,
    sureness: { player: "sure", year: "likely", set: "likely", number: "unsure", parallel: "unsure" },
    parallelOptions: RAW_OPTIONS,
  },
  {
    catalogId: "preview-wemby-select",
    playerName: "Victor Wembanyama",
    sport: "Basketball",
    yearLabel: "2023-24",
    setBrand: "Panini Select",
    cardNumber: "87",
    parallel: "",
    serialRun: null,
    serialNo: "",
    isRookie: true,
    isAuto: false,
    grade: null,
    score: 61,
    sureness: { player: "sure", year: "likely", set: "unsure", number: "unsure", parallel: "unsure" },
    parallelOptions: [{ name: "Base", serialRun: null }, { name: "Silver", serialRun: null }],
  },
  {
    catalogId: "preview-wemby-hoops",
    playerName: "Victor Wembanyama",
    sport: "Basketball",
    yearLabel: "2023-24",
    setBrand: "Hoops",
    cardNumber: "277",
    parallel: "",
    serialRun: null,
    serialNo: "",
    isRookie: true,
    isAuto: false,
    grade: null,
    score: 58,
    sureness: { player: "sure", year: "likely", set: "unsure", number: "unsure", parallel: "unsure" },
    parallelOptions: [{ name: "Base", serialRun: null }],
  },
];

/** A numbered parallel read from the serial stamp: one checklist parallel fits. */
export const PREVIEW_NUMBERED: ScanMatch = {
  ...PREVIEW_RAW[0],
  parallel: "Gold",
  serialRun: 10,
  serialNo: "7",
  score: 130,
  sureness: SURE,
  parallelOptions: [{ name: "Gold", serialRun: 10 }],
};
