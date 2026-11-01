import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardCollectorsSaying } from "@/components/card-collectors-saying";
import { CardCollectorsSayingPending } from "@/components/card-talk-frame";
import { SocialContext, type SocialContextValue } from "@/components/social-provider";
import { CARD_CATALOG } from "@/lib/card-catalog";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { calendarDateInTimeZone } from "@/lib/moving-today/rank";
import { countUpText as countUpTextFromRail } from "@/lib/moving-today/rail";
import { countUpText } from "@/lib/ui/count-up-text";
import directory from "@/lib/players/directory.json";
import {
  dedupePlayers,
  playerNameIsShared,
  prepareRosterIndex,
  resolvedPlayerHref,
  resolvePlayerSlug,
  type PlayerRef,
} from "@/lib/players/slug";
import { saleDayLabel } from "@/lib/value/price-fallback";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** Static (non-type) imports of a module, by specifier. */
function staticImports(source: string): string[] {
  return [...source.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gm)].map((match) => match[1]);
}

/** The roster the card page's player link resolves against: the directory, then the catalog. */
function fullRoster(): PlayerRef[] {
  return [
    ...(directory as { name: string; sport: string }[]).map((player) => ({ name: player.name, sport: player.sport })),
    ...CARD_CATALOG.map((card) => ({ name: card.playerName, sport: card.sport })),
  ];
}

describe("player link roster", () => {
  it("builds in slices and resolves exactly like the one-shot index", async () => {
    const sliced = fullRoster();
    const oneShot = fullRoster();
    let yields = 0;
    await prepareRosterIndex(sliced, {
      budgetMs: 0,
      yieldToMain: async () => {
        yields += 1;
      },
    });
    assert.ok(yields > 10, `expected the build to yield between slices, got ${yields}`);
    const names = [
      ...oneShot.slice(0, 400).map((player) => [player.name, player.sport] as const),
      ["Ja Morant", "Basketball"],
      ["C.J. Stroud", "Football"],
      ["Will Smith", "Baseball"],
      ["Will Smith", null],
      ["Luka Doncic", "Basketball"],
      ["Nobody We Know", "Basketball"],
      ["Pikachu", "Pokemon"],
    ] as const;
    for (const [name, sport] of names) {
      assert.deepEqual(
        resolvedPlayerHref(name, sport, sliced),
        resolvedPlayerHref(name, sport, oneShot),
        `${name} (${sport})`,
      );
      assert.equal(playerNameIsShared(name, sliced), playerNameIsShared(name, oneShot));
    }
    for (const slug of ["ja-morant", "will-smith", "will-smith-hockey", "cj-stroud", "nobody"]) {
      assert.deepEqual(resolvePlayerSlug(slug, sliced), resolvePlayerSlug(slug, oneShot), slug);
    }
  });

  it("keeps dedupePlayers' order and spellings", () => {
    const roster: PlayerRef[] = [
      { name: "JaMarr Chase", sport: "Football" },
      { name: "Ja'Marr Chase", sport: "Football" },
      { name: "Luka Doncic", sport: "Basketball" },
      { name: "Luka Dončić", sport: "Basketball" },
      { name: "Will Smith", sport: "hockey" },
      { name: "Will Smith", sport: "Baseball" },
      { name: "  ", sport: "Baseball" },
    ];
    // The same rows main's one-pass dedupe returned for this roster.
    assert.deepEqual(dedupePlayers(roster), [
      { name: "JaMarr Chase", sport: "Football" },
      { name: "Luka Dončić", sport: "Basketball" },
      { name: "Will Smith", sport: "Baseball" },
      { name: "Will Smith", sport: "Hockey" },
    ]);
  });

  it("shares one build between callers and skips a roster that is already indexed", async () => {
    const roster = fullRoster();
    let yields = 0;
    const options = {
      budgetMs: 0,
      yieldToMain: async () => {
        yields += 1;
      },
    };
    await Promise.all([prepareRosterIndex(roster, options), prepareRosterIndex(roster, options)]);
    const once = yields;
    await prepareRosterIndex(roster, options);
    assert.equal(yields, once);
    const indexed = fullRoster();
    resolvePlayerSlug("ja-morant", indexed);
    yields = 0;
    await prepareRosterIndex(indexed, options);
    assert.equal(yields, 0);
  });

  it("is loaded by the card page's player link without the search index", () => {
    const source = read("components/resolved-player-name.tsx");
    assert.ok(!staticImports(source).includes("@/lib/players/use-directory"));
    assert.match(source, /import\("@\/lib\/players\/directory\.json"\)/);
    assert.match(source, /prepareRosterIndex\(/);
  });
});

describe("New York calendar dates", () => {
  it("reuse one formatter per zone", () => {
    const Original = Intl.DateTimeFormat;
    let made = 0;
    const Counting = function (this: unknown, ...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
      made += 1;
      return new Original(...args);
    } as unknown as typeof Intl.DateTimeFormat;
    Counting.supportedLocalesOf = Original.supportedLocalesOf;
    Intl.DateTimeFormat = Counting;
    try {
      const dates = Array.from({ length: 50 }, (_, day) => new Date(Date.UTC(2026, 9, 1 + day, 3)));
      const first = dates.map((date) => snapshotDateInNewYork(date));
      dates.map((date) => calendarDateInTimeZone(date));
      dates.map((date) => calendarDateInTimeZone(date, "America/Los_Angeles"));
      dates.map((date) => saleDayLabel(date.toISOString()));
      assert.ok(made <= 4, `made ${made} formatters`);
      assert.equal(first[0], "2026-09-30");
      assert.equal(first[1], "2026-10-01");
    } finally {
      Intl.DateTimeFormat = Original;
    }
  });

  it("format the same days as before", () => {
    assert.equal(snapshotDateInNewYork(new Date("2026-11-01T03:59:00Z")), "2026-10-31");
    assert.equal(snapshotDateInNewYork(new Date("2026-11-01T04:00:00Z")), "2026-11-01");
    assert.equal(calendarDateInTimeZone(new Date("2026-11-01T06:00:00Z"), "America/Los_Angeles"), "2026-10-31");
    assert.equal(saleDayLabel("2026-10-02T00:00:00Z"), "Oct 2");
    assert.equal(saleDayLabel("bad"), null);
  });
});

describe("card page first load", () => {
  const social = {
    user: { id: "u1", username: "tester" },
    homePosts: [],
    profiles: [],
    publicCards: [],
    ready: false,
  } as unknown as SocialContextValue;

  function markup(node: React.ReactElement) {
    return renderToStaticMarkup(createElement(SocialContext.Provider, { value: social }, node));
  }

  it("draws the posts section's loading state before its chunk arrives", () => {
    for (const heading of [undefined, "Who's talking about this card"]) {
      const props = heading ? { cardId: "c1", heading } : { cardId: "c1" };
      assert.equal(
        markup(createElement(CardCollectorsSayingPending, props)),
        markup(createElement(CardCollectorsSaying, props)),
      );
    }
  });

  it("loads the posts section, the comps list and the added panel from their own chunks", () => {
    for (const path of ["components/card-detail.tsx", "components/public-card-view.tsx"]) {
      const imports = staticImports(read(path));
      assert.ok(!imports.includes("@/components/card-collectors-saying"), path);
      assert.ok(!imports.includes("@/components/comps-list"), path);
    }
    assert.ok(!staticImports(read("components/card-detail.tsx")).includes("@/components/card-added-panel"));
  });

  it("keeps the movers row's code off every card tile", () => {
    const countUp = staticImports(read("components/count-up.tsx"));
    assert.ok(!countUp.some((path) => path.startsWith("@/lib/moving-today/")), countUp.join(", "));
    assert.equal(countUpTextFromRail, countUpText);
    assert.equal(countUpText("+115%", 0.5), "+58%");
  });

  it("loads the collection share image code on the tap", () => {
    const hero = read("components/portfolio-hero.tsx");
    assert.ok(!staticImports(hero).includes("@/components/collection-value-share"));
    assert.match(hero, /import\("@\/components\/collection-value-share"\)/);
  });
});
