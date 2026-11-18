import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadProductData } from "@/lib/cards/product-data";
import { toMatchCard } from "@/lib/quick-comp/identity";
import { listedParallelNames, otherListedParallels, withProductList } from "./known-run";
import { titleMatchesCard, titleNamesOtherParallel, type MatchCard } from "./match";

/**
 * The card page's sold filter knew only the general parallel words. A product's own parallels
 * (2026-27 Topps: Sandglitter, Diamante, Rainbow Foilboard, Storm, Victory, Wood...) were not on
 * that list, so a Shimmer #257 kept "Sandglitter Shimmer" sales and a Base #257 kept "Rainbow
 * Foilboard" ones. A title that names another parallel on the card's own product list is that
 * parallel's sale.
 */

const peterson = (parallel: string) => ({ ...toMatchCard({ playerName: "Darryn Peterson", year: 2026, yearLabel: "2026-27", setBrand: "Topps", cardNumber: "257", parallel, grade: "Raw" }), sport: "Basketball" });
const TITLES = {
  shimmer: "2026-27 Topps Darryn Peterson #257 Shimmer RC",
  shimmerJazz: "Darryn Peterson 2026-27 Topps Basketball #257 RC Shimmer Utah Jazz",
  sandglitter: "2026-27 Topps Darryn Peterson #257 Sandglitter Shimmer RC",
  diamante: "2026-27 Topps Darryn Peterson #257 Diamante RC Shimmer",
  foilboard: "2026-27 Topps Darryn Peterson #257 Rainbow Foilboard Shimmer",
  base: "2026-27 Topps Darryn Peterson #257 RC Utah Jazz",
  baseFoilboard: "2026-27 Topps Darryn Peterson #257 Rainbow Foilboard RC",
};

describe("a sold title that names another parallel on the card's own product list", () => {
  it("before: with no product list on the card, the Shimmer kept Sandglitter, Diamante and Rainbow Foilboard titles", () => {
    const card = peterson("Shimmer");
    for (const title of [TITLES.sandglitter, TITLES.diamante, TITLES.foilboard]) assert.equal(titleMatchesCard(title, card), true, title);
    assert.equal(titleMatchesCard(TITLES.baseFoilboard, peterson("Base")), true);
  });

  it("the Shimmer #257 keeps its own sales and drops the ones that name Sandglitter, Diamante or Rainbow Foilboard", async () => {
    const card = withProductList(peterson("Shimmer"), await loadProductData());
    assert.ok(card.otherParallels?.includes("Sandglitter") && card.otherParallels.includes("Rainbow Foilboard") && card.otherParallels.includes("Diamante"));
    assert.equal(titleMatchesCard(TITLES.shimmer, card), true);
    assert.equal(titleMatchesCard(TITLES.shimmerJazz, card), true);
    for (const title of [TITLES.sandglitter, TITLES.diamante, TITLES.foilboard]) assert.equal(titleMatchesCard(title, card), false, title);
  });

  it("a Base #257 drops a Rainbow Foilboard sale and every other listed name, and keeps a plain one", async () => {
    const card = withProductList(peterson("Base"), await loadProductData());
    assert.equal(titleMatchesCard(TITLES.base, card), true);
    assert.equal(titleMatchesCard(TITLES.baseFoilboard, card), false);
    assert.equal(titleMatchesCard("2026-27 Topps Darryn Peterson #257 Sandglitter RC", card), false);
    assert.equal(titleMatchesCard("2026-27 Topps Darryn Peterson #257 Victory RC", card), false);
  });

  it("the card's own parallel is never its own other: Sandglitter keeps Sandglitter, and a longer name keeps its shorter words", async () => {
    const products = await loadProductData();
    const sand = withProductList(peterson("Sandglitter"), products);
    assert.ok(!sand.otherParallels?.includes("Sandglitter"));
    assert.equal(titleMatchesCard("2026-27 Topps Darryn Peterson #257 Sandglitter RC", sand), true);
    assert.equal(titleMatchesCard("2026-27 Topps Darryn Peterson #257 Diamante RC", sand), false);
    // "Rainbow Foilboard" holds "Rainbow"; a card that is the Rainbow Foilboard is not rejected for it.
    const card: MatchCard = { ...peterson("Rainbow Foilboard"), otherParallels: ["Rainbow", "Foilboard", "Sandglitter"] };
    assert.equal(titleNamesOtherParallel(TITLES.baseFoilboard, card), false);
    assert.equal(titleNamesOtherParallel("2026-27 Topps Darryn Peterson #257 Sandglitter", card), true);
  });

  it("a named card keeps its family's own word: a Gold sells as Gold Refractor, and that is not the plain Refractor", () => {
    const gold: MatchCard = { ...toMatchCard({ playerName: "Jaxson Dart", year: 2025, yearLabel: "2025", setBrand: "Topps Chrome", cardNumber: "306", parallel: "Gold", grade: "Raw" }), otherParallels: ["Refractor", "X-Fractor", "Gold Wave Refractor", "Blue Refractor"] };
    assert.equal(titleNamesOtherParallel("2025 Topps Chrome Jaxson Dart #306 Gold Refractor /50", gold), false);
    assert.equal(titleNamesOtherParallel("2025 Topps Chrome Jaxson Dart #306 Gold /50 Refractor", gold), false);
    assert.equal(titleNamesOtherParallel("2025 Topps Chrome Jaxson Dart #306 Refractor Gold", gold), false);
    assert.equal(titleNamesOtherParallel("2025 Topps Chrome Jaxson Dart #306 Gold Wave Refractor /50", gold), true);
    assert.equal(titleNamesOtherParallel("2025 Topps Chrome Jaxson Dart #306 Blue Refractor", gold), true);
    assert.equal(titleNamesOtherParallel("2025 Topps Chrome Jaxson Dart #306 X-Fractor", gold), true);
    // A Base card has no word of its own: the plain Refractor is another parallel.
    assert.equal(titleNamesOtherParallel("2025 Topps Chrome Jaxson Dart #306 Refractor", { ...gold, parallel: "Base" }), true);
  });

  it("a team or the player's own name is never the parallel", () => {
    const card: MatchCard = { ...toMatchCard({ playerName: "James Wood", year: 2026, yearLabel: "2026", setBrand: "Topps", cardNumber: "100", parallel: "Base", grade: "Raw" }), otherParallels: ["Wood", "Red", "Gold"] };
    assert.equal(titleNamesOtherParallel("2026 Topps James Wood #100 Nationals", card), false);
    assert.equal(titleNamesOtherParallel("2026 Topps James Wood #100 Boston Red Sox", card), false);
    assert.equal(titleNamesOtherParallel("2026 Topps James Wood #100 Golden moment", card), false);
    assert.equal(titleNamesOtherParallel("2026 Topps James Wood #100 Gold /2026", card), true);
  });

  it("no list for the card: nothing more is rejected, and the card is unchanged", async () => {
    const products = await loadProductData();
    const card = { ...toMatchCard({ playerName: "Darryn Peterson", year: 1961, yearLabel: "1961-62", setBrand: "Fleer", cardNumber: "8", parallel: "Base", grade: "Raw" }), sport: "Basketball" };
    assert.deepEqual(otherListedParallels(products, card), []);
    assert.equal(withProductList(card, products).otherParallels, undefined);
    assert.equal(withProductList(card, null).otherParallels, undefined);
  });

  it("a tier is where the card sits, not a parallel: Select's Field Level is never a name to reject", async () => {
    const names = listedParallelNames(await loadProductData(), { yearLabel: "2023", year: 2023, setBrand: "Panini Select", cardNumber: "389", sport: "Football" });
    assert.ok(names.length > 20);
    for (const tier of ["Field Level", "Club Level", "Concourse", "Premier Level", "Suite Level", "Base"]) assert.ok(!names.includes(tier), tier);
    assert.ok(names.includes("Field Level Tie-Dye Prizm"));
  });
});
