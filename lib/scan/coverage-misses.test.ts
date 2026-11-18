import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import hardCards from "./hard-cards-v1.json";
import { cardKey, closestCards, closestMatch, confirmKeyOf, isKnownCard, onlyPlayerRead, readKeyOf, withPickedCard, type ClosestCard, type PlayerCards } from "./closest";
import { loadPlayerCards } from "./closest-load";
import { checklistCardFor } from "./coverage-known";
import { MAX_CONFIRMED_SHOWN, NOT_KNOWN_MESSAGE, confirmedCardFromBody, respondConfirmCard, respondConfirmedCards, respondScanMiss } from "./coverage-respond";
import { hardCardBack, type HardCard } from "./hard-cards";
import { rankScanMatches, scanChecklistKey, scanPlayer, tierParallels, type ScanMatch, type ScanMatchResult } from "./match";
import { scanMissFromBody, scanMissOf, type ScanMiss } from "./miss";
import { printedProduct, readRawCardText } from "./raw-text";
import { scanReadFrom } from "./session";
import { typedCardAfterMiss } from "./typed-confirm";

/**
 * The three cards a collector scanned on 2026-11-17 that all came back not found
 * (docs/scanner-coverage-plan.md), and the pieces that fixed them. The cards themselves are in the
 * hard-cards set (hc-113 to hc-115), so the bake-off scores them too. Nothing is fetched.
 */

const CARDS = (hardCards as { cards: HardCard[] }).cards;
const card = (id: string) => CARDS.find((item) => item.id === id)!;

async function scan(lines: string[], backLines: string[] | null): Promise<ScanMatchResult> {
  const read = scanReadFrom({ lines, backLines, kind: "card", image: null, alternates: null, backAlternates: null, cert: null }, SCAN_DIRECTORY);
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: await loadProductData(), soldTitles: [], checklists });
}
const scanCard = (id: string) => scan(card(id).typical_ocr_front, hardCardBack(card(id)));

describe("1985-86 Topps Mario Lemieux #9, front only (hc-113)", () => {
  it("the front names no year, set or card #: the scan shows the player and claims nothing else, so nothing can be wrong", async () => {
    const result = await scanCard("hc-113");
    assert.equal(result.matches.length, 1);
    const [top] = result.matches;
    assert.deepEqual([top.playerName, top.yearLabel, top.setBrand, top.cardNumber, top.parallel], ["Mario Lemieux", "", "", "", ""]);
    // Only the player read: the sheet offers his cards to pick from, like no card found.
    assert.equal(onlyPlayerRead(result.matches), true);
  });

  it("never a dead end: his real cards are offered, both 1985-86 #9 cards first, nothing preselected", async () => {
    const read = scanReadFrom({ lines: card("hc-113").typical_ocr_front, backLines: null, kind: "card", image: null }, SCAN_DIRECTORY);
    const player = scanPlayer(read, SCAN_DIRECTORY);
    assert.deepEqual(player, { name: "Mario Lemieux", sport: "Hockey" });
    const cards = closestCards(player!, await loadPlayerCards("Hockey"));
    assert.ok(cards.length >= 2 && cards.length <= 8);
    // The Topps and the O-Pee-Chee share this front: both are offered, and the collector says which.
    assert.deepEqual(
      cards.slice(0, 2).map((item) => `${item.yearLabel} ${item.setBrand} #${item.cardNumber}`).sort(),
      ["1985-86 O-Pee-Chee #9", "1985-86 Topps #9"],
    );
    for (const row of cards.map(closestMatch)) {
      assert.equal(row.sureness.year, "unsure");
      assert.equal(row.parallel, "");
    }
  });

  it("one tap on the Topps: the same scan read as that card is the 1985-86 Topps #9", async () => {
    const picked = withPickedCard({ lines: card("hc-113").typical_ocr_front }, { yearLabel: "1985-86", setBrand: "Topps", cardNumber: "9" });
    assert.deepEqual(picked.lines.slice(-2), ["1985-86 TOPPS", "#9"]);
    const top = (await scan(picked.lines, null)).matches[0];
    assert.deepEqual([top.playerName, top.yearLabel, top.setBrand, top.cardNumber], ["Mario Lemieux", "1985-86", "Topps", "9"]);
    // A second pick replaces the first.
    const again = withPickedCard(picked, { yearLabel: "1985-86", setBrand: "O-Pee-Chee", cardNumber: "9" });
    assert.deepEqual(again.lines, [...card("hc-113").typical_ocr_front, "1985-86 O-PEE-CHEE", "#9"]);
    assert.equal((await scan(again.lines, null)).matches[0].setBrand, "O-Pee-Chee");
  });

  it("a card other collectors picked for the same read comes first, once", () => {
    const index: PlayerCards = { sport: "Hockey", products: [["1985-86", "O-Pee-Chee"], ["1985-86", "Topps"]], players: { mariolemieux: "0:9;1:9" } };
    const cards = closestCards({ name: "Mario Lemieux", sport: "Hockey" }, index, [
      { playerName: "Mario Lemieux", sport: "Hockey", yearLabel: "1985-86", setBrand: "Topps", cardNumber: "9", confirmed: 3 },
      { playerName: "Wayne Gretzky", sport: "Hockey", yearLabel: "1979-80", setBrand: "Topps", cardNumber: "18", confirmed: 9 },
    ]);
    assert.deepEqual(cards.map((item) => `${item.setBrand}${item.confirmed ? ` x${item.confirmed}` : ""}`), ["Topps x3", "O-Pee-Chee"]);
    assert.equal(readKeyOf({ playerName: "MARIO LEMIEUX", sport: "Hockey" }), readKeyOf({ playerName: "Mario Lemieux", sport: "hockey" }));
    assert.equal(readKeyOf({ playerName: "" }), "");
  });
});

describe("2023 Panini Select Mike Evans #389 Field Level, numbered 07/25 (hc-114)", () => {
  it("is the Field Level Tie-Dye Prizm /25: never Base, never an insert, never another tier's /25", async () => {
    const top = (await scanCard("hc-114")).matches[0];
    assert.deepEqual([top.playerName, top.yearLabel, top.setBrand, top.cardNumber], ["Mike Evans", "2023", "Panini Select", "389"]);
    assert.equal(top.parallel, "Field Level Tie-Dye Prizm");
    assert.equal(top.serialRun, 25);
    assert.equal(top.serialNo, "7");
    assert.equal(top.insertName, "Field Level");
    assert.deepEqual(top.parallelOptions.map((option) => option.name), ["Field Level Tie-Dye Prizm"]);
  });

  it("a word in the bio is never an insert: \"a natural instinct\" is not Instinct", () => {
    const back = readRawCardText(card("hc-114").typical_ocr_back!, SCAN_DIRECTORY, { side: "back" });
    assert.equal(back.insert, "");
    // On a line of its own it still is.
    assert.equal(readRawCardText(["VJ EDGECOMBE", "INSTINCT", "28/99"], SCAN_DIRECTORY, { side: "front" }).insert, "Instinct");
  });

  it("the same back as Tesseract read the collector's photo (noise and all): nothing wrong, the /25 still read", async () => {
    const back = ["rPrizn", "FIELD LEVEL", "No. 389", "| AM", "MIKE EVANS", "she:", "TAMPA BAY BUCCANEERS",
      "When you hear “high upside,” think Evans in 2014. The Buccaneers", "sure did when they drafted the Texas A&M receiver, who had",
      "plaved only one year of high school football and two in college. “He", "played like he had a natural instinct of a guy playing his whole life,",
      "GM Jason Licht said. “So you know it's going to get even better.’", "2023 PANINI ~ SELECT FOOTBALL", "07/25", "tQ/2 2 © 2024 Panini America, lec."];
    const top = (await scan(card("hc-114").typical_ocr_front, back)).matches[0];
    assert.deepEqual([top.yearLabel, top.setBrand, top.cardNumber, top.parallel, top.serialRun], ["2023", "Panini Select", "389", "Field Level Tie-Dye Prizm", 25]);
  });

  it("the serial not read (foil, glare): the version stays open with the Field Level versions only, never Base on its own", async () => {
    const back = card("hc-114").typical_ocr_back!.filter((line) => line !== "07/25");
    const top = (await scan(card("hc-114").typical_ocr_front, back)).matches[0];
    assert.equal(top.parallel, "");
    assert.equal(top.serialRun, null);
    assert.ok(top.parallelOptions.length > 1);
    for (const option of top.parallelOptions) assert.ok(option.name === "Base" || option.name.startsWith("Field Level"), option.name);
  });

  it("tiers: only the printed tier's rows are kept, and a list with no tiers (or a card naming none) is left alone", () => {
    const tiered = ["Base", "Club Level", "Club Level Silver Prizm", "Club Level Tie-Dye Prizm", "Club Level Zebra Prizm", "Field Level", "Field Level Silver Prizm", "Field Level Tie-Dye Prizm", "Field Level Zebra Prizm"].map((name) => ({ name, serialRun: null }));
    assert.deepEqual(tierParallels(tiered, ["MIKE EVANS", "FIELD LEVEL"]).map((option) => option.name), ["Base", "Field Level", "Field Level Silver Prizm", "Field Level Tie-Dye Prizm", "Field Level Zebra Prizm"]);
    assert.equal(tierParallels(tiered, [], "Base Club Level").length, 5);
    assert.equal(tierParallels(tiered, ["MIKE EVANS"]).length, tiered.length);
    assert.equal(tierParallels(tiered, ["FIELD LEVEL", "CLUB LEVEL"]).length, tiered.length);
    const flat = ["Base", "Silver", "Gold", "Green", "Blue"].map((name) => ({ name, serialRun: null }));
    assert.equal(tierParallels(flat, ["SILVER"]).length, flat.length);
  });
});

describe("2023 Panini Illusions Sam LaPorta First Impressions #131, rookie patch auto 03/10 (hc-115)", () => {
  it("is the rookie patch autograph: Illusions, #131, First Impressions, RC, auto, patch, /10, the version open", async () => {
    const top = (await scanCard("hc-115")).matches[0];
    assert.deepEqual([top.playerName, top.yearLabel, top.setBrand, top.cardNumber], ["Sam LaPorta", "2023", "Panini Illusions", "131"]);
    assert.equal(top.insertName, "First Impressions");
    assert.equal(top.isRookie, true);
    assert.equal(top.isAuto, true);
    assert.equal(top.isRelic, true);
    assert.equal(top.serialRun, 10);
    assert.equal(top.serialNo, "3");
    // No list we have names the /10: open, never Base.
    assert.equal(top.parallel, "");
    assert.notEqual(top.sureness.set, "unsure");
  });

  it("the serial up the edge not read: still the patch auto, the run open", async () => {
    const front = card("hc-115").typical_ocr_front.filter((line) => line !== "03/10");
    const top = (await scan(front, hardCardBack(card("hc-115")))).matches[0];
    assert.deepEqual([top.setBrand, top.cardNumber, top.insertName, top.isAuto, top.isRelic, top.serialRun], ["Panini Illusions", "131", "First Impressions", true, true, null]);
  });

  it("the same photos as Tesseract read them: the set, # and patch auto still read, nothing wrong", async () => {
    const back = ["No. 131", "PSY MMPRESSIOL", "The enclosed authentic memorabilia is not from any specific game or event.", "The autograph is guaranteed by Panini America, Inc.", "(Pamrer)", "2023 PANINI — ILLUSIONS FOOTBALL", "OQIEFE © 2024 Panini America, Inc.", "NFLPA"];
    const top = (await scan(["SAM LaPORTA", "FIRST IMPRE RESSIONS"], back)).matches[0];
    assert.deepEqual([top.playerName, top.yearLabel, top.setBrand, top.cardNumber, top.isAuto, top.isRelic], ["Sam LaPorta", "2023", "Panini Illusions", "131", true, true]);
    assert.equal(top.parallel, "");
  });

  it("a back's product line names its product, even one our set list has never heard of", () => {
    assert.equal(printedProduct(["2023 PANINI - ILLUSIONS FOOTBALL"]), "Panini Illusions");
    assert.equal(printedProduct(["2022-23 PANINI – NOIR BASKETBALL"]), "Panini Noir");
    assert.equal(printedProduct(["2023 PANINI ~ ZENITH FOOTBALL"]), "Panini Zenith");
    // Not a product line: a bare maker, a sentence, a stat row.
    assert.equal(printedProduct(["2023 PANINI FOOTBALL"]), "");
    assert.equal(printedProduct(["© 2024 Panini America, Inc."]), "");
    assert.equal(printedProduct(["2023 Panini said he played college football and high school baseball"]), "");
    // A set on our list is read the usual way, and the product text stays out of it.
    const select = readRawCardText(["No. 389", "2023 PANINI - SELECT FOOTBALL"], SCAN_DIRECTORY, { side: "back" });
    assert.deepEqual(select.setNames, ["Panini Select"]);
    assert.equal(select.productText, undefined);
    // Never off a front.
    assert.equal(readRawCardText(["2023 PANINI - ILLUSIONS FOOTBALL"], SCAN_DIRECTORY, { side: "front" }).productText, undefined);
  });

  it("the memorabilia notice is a patch signal; a bio that says patch or jersey is not", () => {
    const relic = (lines: string[]) => Boolean(readRawCardText(lines, SCAN_DIRECTORY, { side: "back" }).isRelic);
    assert.equal(relic(["The enclosed authentic memorabilia is not from any specific game or event."]), true);
    assert.equal(relic(["The enclosed player-worn material is guaranteed by Panini America, Inc."]), true);
    assert.equal(relic(["ROOKIE PATCH AUTOGRAPHS"]), true);
    assert.equal(relic(["He went through a rough patch in May before finding his swing again."]), false);
    assert.equal(relic(["No. 131", "SAM LaPORTA"]), false);
  });
});

const match = (over: Partial<ScanMatch>): ScanMatch => ({ ...closestMatch({ playerName: "Sam LaPorta", sport: "Football", yearLabel: "2023", setBrand: "", cardNumber: "131" }), ...over });
const input = (result: ScanMatchResult | null, over: Partial<Parameters<typeof scanMissOf>[0]> = {}) => ({
  capture: { lines: ["SAM LaPORTA", "PSA 12345678"], backLines: ["No. 131"], kind: "card" as const },
  result,
  player: { name: "Sam LaPorta", sport: "Football" },
  searched: { catalog: ["Sam LaPorta 2023 131", "Sam LaPorta"], checklist: { years: ["2023"], setBrand: "Panini Illusions", sport: "Football" }, checklistFiles: 0 },
  closest: 0,
  ...over,
});

describe("the miss log", () => {
  it("says why each kind of scan fell out, with what was read and searched", () => {
    assert.equal(scanMissOf(input({ matches: [], settled: false }, { capture: { lines: [], backLines: null, kind: null } }))?.reason, "no_text");
    assert.equal(scanMissOf(input({ matches: [], settled: false }, { player: { name: "", sport: "" } }))?.reason, "no_player");
    assert.equal(scanMissOf(input({ matches: [], settled: false, unpinned: true }))?.reason, "unpinned");
    const only = scanMissOf(input({ matches: [], settled: false }, { closest: 8 }))!;
    assert.equal(only.reason, "player_only");
    assert.match(only.why, /8 of their cards/);
    assert.equal(only.read.player, "Sam LaPorta");
    const open = scanMissOf(input({ matches: [match({ sureness: { player: "sure", year: "sure", set: "unsure", number: "sure", parallel: "unsure" } })], settled: false }))!;
    assert.equal(open.reason, "open_fields");
    assert.match(open.why, /set open\. No checklist for 2023 Panini Illusions Football/);
    assert.deepEqual(open.searched, { catalog: ["Sam LaPorta 2023 131", "Sam LaPorta"], checklist: "2023 Panini Illusions Football", checklistFiles: 0 });
  });

  it("a scan that ended on its card (year, set and # read) is not a miss, unless the collector left it", () => {
    const read = match({ setBrand: "Panini Illusions", sureness: { player: "sure", year: "sure", set: "likely", number: "sure", parallel: "unsure" } });
    assert.equal(scanMissOf(input({ matches: [read], settled: false })), null);
    assert.equal(scanMissOf(input({ matches: [read], settled: false }, { leftForSearch: true }))?.reason, "none_of_these");
  });

  it("never logs a cert number or any long run of digits, and keeps the lines short", () => {
    const miss = scanMissOf(input({ matches: [], settled: false }, { capture: { lines: ["PSA 12345678", "x".repeat(400), ...Array.from({ length: 80 }, (_, i) => `line ${i}`)], backLines: null, kind: "slab" } }))!;
    assert.equal(miss.lines[0], "PSA #");
    assert.equal(miss.lines[1].length, 120);
    assert.equal(miss.lines.length, 40);
  });

  it("a miss from a request is taken field by field: a bad reason is refused, extras are dropped", () => {
    assert.equal(scanMissFromBody({ reason: "nope" }), null);
    assert.equal(scanMissFromBody(null), null);
    const miss = scanMissFromBody({ reason: "player_only", why: "w", kind: "weird", lines: ["A", 7, "cert 123456789"], userId: "x", read: { player: "Mario Lemieux", run: -4 }, shown: { closest: 8 } })!;
    assert.deepEqual(miss.lines, ["A", "cert #"]);
    assert.equal(miss.kind, "unknown");
    assert.equal(miss.read.run, null);
    assert.equal(miss.shown.closest, 8);
    assert.equal("userId" in miss, false);
  });
});

const gate = { enabled: () => true, userId: async () => "user-1" as string | null, allow: async () => true };
const post = (body: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });

describe("the coverage routes", () => {
  it("POST /api/scan/miss: logs and stores; signed out, off or too fast stores nothing", async () => {
    const stored: ScanMiss[] = [];
    const logged: ScanMiss[] = [];
    const deps = { ...gate, store: async (miss: ScanMiss) => void stored.push(miss), log: (miss: ScanMiss) => void logged.push(miss) };
    const ok = await respondScanMiss(post({ reason: "player_only", lines: ["MARIO LEMIEUX", "C"] }), deps);
    assert.deepEqual(await ok.json(), { ok: true, stored: true });
    assert.equal(stored[0].lines[0], "MARIO LEMIEUX");
    assert.equal(logged.length, 1);
    assert.equal((await respondScanMiss(post({ reason: "bad" }), deps)).status, 400);
    assert.equal((await respondScanMiss(post({ reason: "no_text" }), { ...deps, userId: async () => null })).status, 401);
    assert.equal((await respondScanMiss(post({ reason: "no_text" }), { ...deps, enabled: () => false })).status, 404);
    assert.equal((await respondScanMiss(post({ reason: "no_text" }), { ...deps, allow: async () => false })).status, 429);
    assert.equal(stored.length, 1);
  });

  const known = checklistCardFor;
  const LEMIEUX_KEY = "mariolemieux|hockey||||";
  const TOPPS: ClosestCard = { playerName: "Mario Lemieux", sport: "Hockey", yearLabel: "1985-86", setBrand: "Topps", cardNumber: "9" };

  it("the tables not there yet: the miss is still logged, and the scan is not failed", async () => {
    const logged: ScanMiss[] = [];
    const response = await respondScanMiss(post({ reason: "no_player" }), { ...gate, store: async () => { throw new Error("relation does not exist"); }, log: (miss) => void logged.push(miss) });
    assert.deepEqual(await response.json(), { ok: true, stored: false });
    assert.equal(logged.length, 1);
    const read = await respondConfirmedCards(new Request(`http://localhost/api?key=${LEMIEUX_KEY}`), { ...gate, known, read: async () => { throw new Error("relation does not exist"); } });
    assert.deepEqual(await read.json(), { cards: [] });
    const save = await respondConfirmCard(post({ key: LEMIEUX_KEY, card: TOPPS }), { ...gate, known, save: async () => { throw new Error("no"); } });
    assert.deepEqual(await save.json(), { ok: true, stored: false });
  });

  it("a confirmed card is saved with the signed-in user, for one vote per user per card", async () => {
    const saved: string[] = [];
    const deps = { ...gate, known, save: async (key: string, item: ClosestCard, userId: string) => void saved.push(`${userId} ${key} ${item.yearLabel} ${item.setBrand} #${item.cardNumber}`) };
    assert.equal((await respondConfirmCard(post({ key: LEMIEUX_KEY, card: TOPPS }), deps)).status, 200);
    assert.equal((await respondConfirmCard(post({ key: LEMIEUX_KEY, card: TOPPS }), { ...deps, userId: async () => null })).status, 401);
    assert.deepEqual(saved, ["user-1 mariolemieux|hockey|||| 1985-86 Topps #9"]);
  });

  it("a confirmed card is saved as the checklist spells it, so two spellings are one vote count", async () => {
    const saved: ClosestCard[] = [];
    const deps = { ...gate, known, save: async (_key: string, item: ClosestCard) => void saved.push(item) };
    // However the phone or the collector spells it: "T.o.p.p.s", "TOPPS", "mario lemieux", "hockey".
    const spellings: ClosestCard[] = [
      { ...TOPPS, setBrand: "T.o.p.p.s" },
      { ...TOPPS, setBrand: "TOPPS", playerName: "MARIO LEMIEUX" },
      { ...TOPPS, playerName: "mario lemieux", sport: "hockey" },
    ];
    for (const spelling of spellings) assert.equal((await respondConfirmCard(post({ key: LEMIEUX_KEY, card: spelling }), deps)).status, 200);
    assert.deepEqual(saved, [TOPPS, TOPPS, TOPPS]);
  });

  it("the checklist's own card: its player, year, set and card #, or null for a card it doesn't have", async () => {
    assert.deepEqual(await checklistCardFor({ playerName: "MARIO LEMIEUX", sport: "hockey", yearLabel: "1985-86", setBrand: "t.o.p.p.s", cardNumber: "9" }), TOPPS);
    assert.equal(await checklistCardFor({ ...TOPPS, cardNumber: "999" }), null);
    assert.equal(await checklistCardFor({ ...TOPPS, sport: "Cricket" }), null);
  });

  it("a card our checklists don't have for that player is refused: \"Not a card we know\", and nothing is saved", async () => {
    const saved: string[] = [];
    const deps = { ...gate, known, save: async (key: string) => void saved.push(key) };
    const refused = async (body: unknown) => {
      const response = await respondConfirmCard(post(body), deps);
      assert.equal(response.status, 400);
      return ((await response.json()) as { error: string }).error;
    };
    // A made-up card, a made-up set, a real card # in the wrong year, another player's card, a made-up player.
    assert.equal(await refused({ key: LEMIEUX_KEY, card: { ...TOPPS, cardNumber: "999" } }), NOT_KNOWN_MESSAGE);
    assert.equal(await refused({ key: LEMIEUX_KEY, card: { ...TOPPS, setBrand: "Totally Real Gold" } }), NOT_KNOWN_MESSAGE);
    assert.equal(await refused({ key: LEMIEUX_KEY, card: { ...TOPPS, yearLabel: "1975-76" } }), NOT_KNOWN_MESSAGE);
    assert.equal(await refused({ key: "nobodyreal|hockey||||", card: { ...TOPPS, playerName: "Nobody Real" } }), NOT_KNOWN_MESSAGE);
    // The key must be the card's own player's read: a real Lemieux card filed under Gretzky's read is refused.
    assert.equal(await refused({ key: "waynegretzky|hockey||||", card: TOPPS }), NOT_KNOWN_MESSAGE);
    // A sport we have no list for is not a card we know.
    assert.equal(await refused({ key: "mariolemieux|cricket||||", card: { ...TOPPS, sport: "Cricket" } }), NOT_KNOWN_MESSAGE);
    // The check itself failing is a no, never a yes.
    assert.equal((await respondConfirmCard(post({ key: LEMIEUX_KEY, card: TOPPS }), { ...deps, known: async () => { throw new Error("load failed"); } })).status, 400);
    // Malformed input is still refused first.
    assert.equal((await respondConfirmCard(post({ key: "Mario Lemieux; drop", card: TOPPS }), deps)).status, 400);
    assert.equal((await respondConfirmCard(post({ key: LEMIEUX_KEY, card: { ...TOPPS, yearLabel: "soon" } }), deps)).status, 400);
    assert.equal(confirmedCardFromBody({ ...TOPPS, cardNumber: "9; x" }), null);
    assert.equal(confirmedCardFromBody({ ...TOPPS, setBrand: "" }), null);
    assert.deepEqual(saved, []);
  });

  it("the database's own answers: too many votes is 429, a row it refuses is 400, anything else is not stored", async () => {
    const failing = (message: string) => respondConfirmCard(post({ key: LEMIEUX_KEY, card: TOPPS }), { ...gate, known, save: async () => { throw new Error(message); } });
    assert.equal((await failing("scan_confirm_rate_limited")).status, 429);
    const invalid = await failing("P0001: scan_confirm_invalid");
    assert.equal(invalid.status, 400);
    assert.equal(((await invalid.json()) as { error: string }).error, NOT_KNOWN_MESSAGE);
    const other = await failing("function confirm_scan_card(text, text, text, text, text, text) does not exist");
    assert.deepEqual(await other.json(), { ok: true, stored: false });
  });

  it("reading the picks back: a made-up row, or one filed under another player's read, is never shown", async () => {
    const rows: ClosestCard[] = [
      { ...TOPPS, confirmed: 3 },
      { ...TOPPS, setBrand: "Totally Real Gold", confirmed: 50 },
      { ...TOPPS, cardNumber: "999", confirmed: 9 },
      { playerName: "Wayne Gretzky", sport: "Hockey", yearLabel: "1979-80", setBrand: "Topps", cardNumber: "18", confirmed: 7 },
    ];
    const response = await respondConfirmedCards(new Request(`http://localhost/api?key=${LEMIEUX_KEY}`), { ...gate, known, read: async () => rows });
    assert.deepEqual(((await response.json()) as { cards: ClosestCard[] }).cards, [{ ...TOPPS, confirmed: 3 }]);
    assert.equal((await respondConfirmedCards(new Request("http://localhost/api?key=x"), { ...gate, known, read: async () => rows })).status, 400);
  });

  it("reading the picks back: made-up rows on top don't push real ones out; the top 5 that pass are shown, as the checklist spells them", async () => {
    const real = closestCards({ name: "Mario Lemieux", sport: "Hockey" }, await loadPlayerCards("Hockey")).slice(0, 7);
    assert.equal(real.length, 7);
    const junk = Array.from({ length: 10 }, (_, at): ClosestCard => ({ ...TOPPS, cardNumber: `${900 + at}`, confirmed: 99 - at }));
    const rows = [
      ...junk,
      ...real.map((item, at) => ({ ...item, setBrand: item.setBrand.toUpperCase(), confirmed: 20 - at })),
      // An old row saved under the collector's spelling: the same card, shown once.
      { ...real[0], setBrand: real[0].setBrand.split("").join("."), confirmed: 2 },
    ];
    const response = await respondConfirmedCards(new Request(`http://localhost/api?key=${LEMIEUX_KEY}`), { ...gate, known, read: async () => rows });
    const cards = ((await response.json()) as { cards: ClosestCard[] }).cards;
    assert.equal(MAX_CONFIRMED_SHOWN, 5);
    assert.deepEqual(cards, real.slice(0, 5).map((item, at) => ({ ...item, confirmed: 20 - at })));
  });

  it("a known card is checked against every card of the player's, not just the 8 the list shows", async () => {
    const index = await loadPlayerCards("Hockey");
    const late: ClosestCard = { playerName: "Mario Lemieux", sport: "Hockey", yearLabel: "2005-06", setBrand: "Upper Deck", cardNumber: "150" };
    assert.ok(!closestCards({ name: "Mario Lemieux", sport: "Hockey" }, index).some((item) => cardKey(item) === cardKey(late)), "past the list's cap");
    assert.equal(isKnownCard(late, index), true);
    assert.equal(isKnownCard({ ...late, cardNumber: "151" }, index), false);
    assert.equal(isKnownCard(late, null), false);
    assert.equal(confirmKeyOf(late), "mariolemieux|hockey||||");
  });
});

describe("a card typed in after a miss", () => {
  const typed = { playerName: "Mario Lemieux", sport: "Hockey", yearLabel: "1985-86", setBrand: "Topps", cardNumber: "#9" };

  it("is sent for the read that missed, as the card typed", () => {
    assert.deepEqual(typedCardAfterMiss(typed, "mariolemieux|hockey||||"), {
      key: "mariolemieux|hockey||||",
      card: { playerName: "Mario Lemieux", sport: "Hockey", yearLabel: "1985-86", setBrand: "Topps", cardNumber: "9" },
    });
  });

  it("is not sent with no miss pending, for another player than the scan read, or with a field missing", () => {
    assert.equal(typedCardAfterMiss(typed, null), null);
    assert.equal(typedCardAfterMiss({ ...typed, playerName: "Wayne Gretzky" }, "mariolemieux|hockey||||"), null);
    assert.equal(typedCardAfterMiss({ ...typed, cardNumber: "" }, "mariolemieux|hockey||||"), null);
    assert.equal(typedCardAfterMiss({ ...typed, yearLabel: " " }, "mariolemieux|hockey||||"), null);
  });
});
