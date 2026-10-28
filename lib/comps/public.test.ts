import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { before, describe, it, mock } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sanitizeProps } from "@/lib/analytics";
import { safeNext, signupPath } from "@/lib/auth/safe-next";
import { buildQueryKey } from "@/lib/comps/query-key";
import { PublicCardCompsPreview, trackPublicCompsCta } from "@/components/public-card-comps";
import { money } from "@/lib/format";
import { mapCardRow, type CardRow } from "@/lib/social/cards";
import {
  hiddenPublicComps,
  NOT_ENOUGH_RECENT_SALES,
  SAMPLE_COMPS_LABEL,
  soldSourceLabel,
  STORED_SALE_SOURCE,
  TRAWL_SOURCE_CREDIT,
  type PublicCardComps,
  type PublicCompSale,
} from "@/lib/comps/public-types";

const nodeRequire = createRequire(import.meta.url);
const serverOnlyEmpty = pathToFileURL(
  nodeRequire.resolve("server-only").replace(/index\.js$/, "empty.js"),
).href;

type ResolveHook = (
  specifier: string,
  context: object,
  nextResolve: (specifier: string, context: object) => { url: string },
) => { url: string; shortCircuit?: boolean };

const registerHooks = (
  nodeRequire("node:module") as { registerHooks?: (hooks: { resolve: ResolveHook }) => void }
).registerHooks;

if (!registerHooks) {
  throw new Error("node:module registerHooks is required to import server-only modules in tests");
}

const hookFlag = "__slabholdServerOnlyTestHook";
if (!(globalThis as Record<string, unknown>)[hookFlag]) {
  (globalThis as Record<string, unknown>)[hookFlag] = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") {
        return { url: serverOnlyEmpty, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}

const CARD = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
const CARD_PATH = `/u/sam/cards/${CARD}`;

type Row = Record<string, unknown>;
type PublicModule = {
  getPublicCardComps: (
    cardKey: string,
    client?: PublicClient | null,
  ) => Promise<PublicCardComps>;
  publicCardQueryKey: (row: Row) => string;
  newestStoredSales: (rows: readonly Row[], limit?: number) => PublicCompSale[];
};

type PublicClient = {
  from(table: string): PublicQuery;
};

type PublicQuery = {
  select(columns: string): PublicQuery;
  eq(column: string, value: string): PublicQuery;
  neq(column: string, value: string): PublicQuery;
  order(column: string, options?: { ascending?: boolean }): PublicQuery;
  limit(count: number): PublicQuery;
  maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }>;
  then<T>(
    resolve: (value: { data: Row[] | null; error: { message: string } | null }) => T,
    reject?: (reason: unknown) => T,
  ): Promise<T>;
};

let getPublicCardComps: PublicModule["getPublicCardComps"];
let publicCardQueryKey: PublicModule["publicCardQueryKey"];
let newestStoredSales: PublicModule["newestStoredSales"];

const calls = { trawl: 0, ebay: 0, refresh: 0, sold: 0 };
const fetchTrawlSold = mock.fn(async () => {
  calls.trawl += 1;
  throw new Error("trawl must not be called");
});
const fetchEbay = mock.fn(async () => {
  calls.ebay += 1;
  throw new Error("ebay must not be called");
});
const refreshCardValue = mock.fn(async () => {
  calls.refresh += 1;
  throw new Error("refresh must not be called");
});
const getSoldComps = mock.fn(async () => {
  calls.sold += 1;
  throw new Error("getSoldComps must not be called");
});

before(async () => {
  const loaded = (await import("./public")) as unknown as PublicModule;
  getPublicCardComps = loaded.getPublicCardComps;
  publicCardQueryKey = loaded.publicCardQueryKey;
  newestStoredSales = loaded.newestStoredSales;
});

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function fakeClient(tables: Record<string, Row[]>): PublicClient {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let orderCol: string | null = null;
      let ascending = true;
      let limitN: number | null = null;
      const run = () => {
        let out = (tables[table] ?? []).filter((row) => filters.every((fn) => fn(row)));
        if (orderCol) {
          const col = orderCol;
          out = [...out].sort((a, b) => {
            const av = String(a[col] ?? "");
            const bv = String(b[col] ?? "");
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return ascending ? cmp : -cmp;
          });
        }
        if (limitN != null) out = out.slice(0, limitN);
        return out;
      };
      const builder: PublicQuery = {
        select() {
          return builder;
        },
        eq(column, value) {
          filters.push((row) => row[column] === value);
          return builder;
        },
        neq(column, value) {
          filters.push((row) => row[column] !== value);
          return builder;
        },
        order(column, options) {
          orderCol = column;
          ascending = options?.ascending !== false;
          return builder;
        },
        limit(count) {
          limitN = count;
          return builder;
        },
        async maybeSingle() {
          return { data: run()[0] ?? null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: run(), error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

function identityRow(): Row {
  return {
    id: CARD,
    user_id: "owner-1",
    player: "Victor Wembanyama",
    year: 2023,
    set: "Prizm",
    grade: "10",
    grader: "PSA",
    parallel: "Silver",
    paid_price: 999,
    estimated_value: 10,
    image_url: null,
    card_number: "136",
    sport: "Basketball",
    purchase_date: "2024-01-02",
    sell_price: 50,
    sell_date: "2024-02-02",
    notes: "SECRETNOTE",
    cert_number: "CERTSECRET",
    accent: "#7c5cff",
    is_public: true,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: null,
    no_number: false,
    year_label: "2023-24",
    set_name: "Panini Prizm",
    serial_run: 99,
    is_auto: true,
    is_relic: false,
    condition_type: "graded",
    grade_qualifier: "OC",
    seller: "hidden-shop",
    url: "https://www.ebay.com/itm/secret",
    item_id: "listing-secret",
  };
}

function loaderKey(row: CardRow): string {
  const card = mapCardRow(row);
  return buildQueryKey({
    id: card.id,
    year: card.year,
    yearLabel: card.yearLabel,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber || undefined,
    grade: card.grade || undefined,
    parallel: card.parallel || undefined,
    serialRun: card.serialRun,
    isAuto: card.isAuto,
    isRelic: card.isRelic,
    conditionType: card.conditionType,
    gradeQualifier: card.gradeQualifier || null,
  });
}

function storedSales(queryKey: string): Row[] {
  const latest = "2026-10-18T00:00:00.000Z";
  const older = "2026-01-01T00:00:00.000Z";
  const sale = (
    price: number,
    soldAt: string,
    fetchedAt: string,
    itemId: string,
  ): Row => ({
    query_key: queryKey,
    fetched_at: fetchedAt,
    price,
    sold_at: soldAt,
    grade: "10",
    grader: "PSA",
    item_id: itemId,
    title: "SECRET listing title",
    url: `https://www.ebay.com/itm/${itemId}`,
    seller: "hidden-shop",
    seller_name: "Hidden Shop",
    user_id: "owner-1",
    buyer: "buyer-1",
    card_id: CARD,
  });
  return [
    sale(10, "2026-01-02T00:00:00.000Z", latest, "111"),
    sale(20, "2026-02-02T00:00:00.000Z", latest, "222"),
    sale(30, "2026-03-02T00:00:00.000Z", latest, "333"),
    sale(40, "2026-04-02T00:00:00.000Z", latest, "444"),
    sale(500, "2026-12-02T00:00:00.000Z", older, "old-batch"),
    {
      ...sale(0, "2026-05-02T00:00:00.000Z", latest, "__empty__"),
      url: "https://www.ebay.com/itm/empty",
    },
  ];
}

function publicTables(queryKey: string, value?: Row): Record<string, Row[]> {
  return {
    public_cards: [identityRow()],
    card_values: [
      value ?? {
        card_id: CARD,
        median: 35,
        low: 30,
        high: 40,
        n_sales: 4,
        status: "ok",
        query_key: queryKey,
        matched_at: "2026-10-01T12:00:00.000Z",
        user_id: "owner-1",
      },
    ],
    sold_comps_cache: storedSales(queryKey),
  };
}

function renderPreview(comps: PublicCardComps, pathname = CARD_PATH): string {
  return renderToStaticMarkup(
    createElement(PublicCardCompsPreview, { comps, pathname }),
  );
}

function assertNoPrivateFields(value: unknown) {
  const packed = JSON.stringify(value);
  assert.equal(packed.includes("SECRET"), false);
  assert.equal(packed.includes("hidden-shop"), false);
  assert.equal(packed.includes("Hidden Shop"), false);
  assert.equal(packed.includes("buyer-1"), false);
  assert.equal(packed.includes("owner-1"), false);
  assert.equal(packed.includes("http"), false);
  assert.equal(packed.includes("itm/"), false);
  assert.equal(packed.includes("listing-secret"), false);
  assert.equal(packed.includes("999"), false);
  assert.equal(packed.includes("CERTSECRET"), false);
}

describe("getPublicCardComps", () => {
  it("matches the query key the signed-in loader stores, without paid or notes", () => {
    const row = identityRow() as CardRow;
    const key = publicCardQueryKey(row);
    assert.equal(key, loaderKey(row));
    assert.equal(key.includes("SECRETNOTE"), false);
    assert.equal(key.includes("CERTSECRET"), false);
    assert.equal(key.includes("999"), false);
  });

  it("returns at most 3 newest sales and strips seller, url, and owner fields", async () => {
    const key = publicCardQueryKey(identityRow());
    const stripped = newestStoredSales(storedSales(key), 3);
    assert.equal(stripped.length, 3);
    assert.deepEqual(
      stripped.map((sale) => sale.priceCents),
      [50000, 4000, 3000],
    );
    for (const sale of stripped) {
      assert.deepEqual(Object.keys(sale).sort(), ["grade", "priceCents", "soldAt", "source"]);
      assert.equal(sale.source, "Recent sold");
      assert.equal(sale.grade, "PSA 10");
    }

    const result = await getPublicCardComps(CARD, fakeClient(publicTables(key)));
    assert.equal(result.status, "ok");
    assert.equal(result.nSales, 4);
    assert.equal(result.medianCents, 3500);
    assert.equal(result.p25Cents, 3000);
    assert.equal(result.p75Cents, 4000);
    assert.equal(result.sales.length, 3);
    assert.deepEqual(
      result.sales.map((sale) => sale.priceCents),
      [4000, 3000, 2000],
    );
    assertNoPrivateFields(result);
    assert.equal(JSON.stringify(result).includes("1000"), false);
    assert.equal(JSON.stringify(result).includes("50000"), false);
  });

  it("drops the owner's newest flagged sale and keeps the 3 newest that remain", async () => {
    const key = publicCardQueryKey(identityRow());
    const latest = "2026-10-18T00:00:00.000Z";
    const sale = (price: number, soldAt: string, itemId: string): Row => ({
      query_key: key,
      fetched_at: latest,
      price,
      sold_at: soldAt,
      grade: "10",
      grader: "PSA",
      item_id: itemId,
      title: "SECRET listing title",
      url: `https://www.ebay.com/itm/${itemId}`,
      seller: "hidden-shop",
      reason: "not-a-match",
    });
    const rows = [
      sale(10, "2026-01-02T00:00:00.000Z", "111"),
      sale(20, "2026-02-02T00:00:00.000Z", "222"),
      sale(30, "2026-03-02T00:00:00.000Z", "333"),
      sale(40, "2026-04-02T00:00:00.000Z", "444"),
      sale(50, "2026-05-02T00:00:00.000Z", "555"),
    ];
    const tables = publicTables(key);
    tables.sold_comps_cache = rows;
    tables.cards = [{ id: CARD, user_id: "owner-1" }];
    tables.comp_flags = [
      { card_id: CARD, user_id: "owner-1", item_id: "555", reason: "not-a-match" },
      { card_id: CARD, user_id: "other-user", item_id: "444", reason: "not-a-match" },
    ];

    const result = await getPublicCardComps(CARD, fakeClient(tables));
    assert.deepEqual(
      result.sales.map((row) => row.priceCents),
      [4000, 3000, 2000],
    );
    for (const row of result.sales) {
      assert.deepEqual(Object.keys(row).sort(), ["grade", "priceCents", "soldAt", "source"]);
    }
    const packed = JSON.stringify(result);
    assert.equal(packed.includes("555"), false);
    assert.equal(packed.includes("111"), false);
    assert.equal(packed.includes("not-a-match"), false);
    assert.equal(packed.includes("item_id"), false);
    assert.equal(packed.includes("reason"), false);
    assertNoPrivateFields(result);

    const otherOnly = {
      ...tables,
      comp_flags: [{ card_id: CARD, user_id: "other-user", item_id: "555", reason: "not-a-match" }],
    };
    const unhidden = await getPublicCardComps(CARD, fakeClient(otherOnly));
    assert.deepEqual(
      unhidden.sales.map((row) => row.priceCents),
      [5000, 4000, 3000],
    );
    for (const row of unhidden.sales) {
      assert.deepEqual(Object.keys(row).sort(), ["grade", "priceCents", "soldAt", "source"]);
    }
    assert.equal(JSON.stringify(unhidden).includes("not-a-match"), false);
  });

  it("makes zero Trawl, eBay, refresh, or getSoldComps calls", async () => {
    const source = read("lib/comps/public.ts");
    for (const forbidden of [
      "getSoldComps",
      "refreshCardValue",
      "fetchTrawlSold",
      "lib/comps/trawl",
      "lib/value/getCardValue",
      "lib/value/card-market",
      "api.trawl",
      "api.ebay",
      "ebay.com",
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
    assert.match(source, /unstable_cache/);
    assert.match(source, /cardCacheTag\(cardKey\)/);
    assert.match(source, /soldCompsAccess/);

    calls.trawl = 0;
    calls.ebay = 0;
    calls.refresh = 0;
    calls.sold = 0;
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      calls.trawl += 1;
      throw new Error("network");
    });
    try {
      const key = publicCardQueryKey(identityRow());
      const result = await getPublicCardComps(CARD, fakeClient(publicTables(key)));
      assert.equal(result.sales.length, 3);
      assert.equal(calls.trawl, 0);
      assert.equal(calls.ebay, 0);
      assert.equal(calls.refresh, 0);
      assert.equal(calls.sold, 0);
      assert.equal(fetchTrawlSold.mock.calls.length, 0);
      assert.equal(fetchEbay.mock.calls.length, 0);
      assert.equal(refreshCardValue.mock.calls.length, 0);
      assert.equal(getSoldComps.mock.calls.length, 0);
      assert.equal(fetchMock.mock.calls.length, 0);
    } finally {
      fetchMock.mock.restore();
    }
  });

  it("returns no prices when the database client is missing", async () => {
    const result = await getPublicCardComps(CARD, null);
    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.sales, []);
    assert.equal(result.medianCents, null);
    const html = renderPreview(result);
    assert.match(html, new RegExp(NOT_ENOUGH_RECENT_SALES));
    assert.equal(html.includes("Fair price"), false);
    assert.equal(html.includes("$"), false);
  });

  it("returns no comps, range, or values for a private card", async () => {
    const key = publicCardQueryKey(identityRow());
    const tables = publicTables(key, {
      card_id: CARD,
      median: 999,
      low: 999,
      high: 999,
      n_sales: 9,
      status: "ok",
      query_key: key,
      matched_at: "2026-10-01T12:00:00.000Z",
      user_id: "owner-1",
    });
    tables.public_cards = [];
    const result = await getPublicCardComps(CARD, fakeClient(tables));
    assert.equal(result.status, "hidden");
    assert.deepEqual(result.sales, []);
    assert.equal(result.medianCents, null);
    assert.equal(result.p25Cents, null);
    assert.equal(result.p75Cents, null);
    assert.equal(result.nSales, 0);
    assert.equal(renderPreview(result), "");
    assertNoPrivateFields(result);
  });

  it("does not return stored prices when the row is sample data", async () => {
    const key = publicCardQueryKey(identityRow());
    const result = await getPublicCardComps(
      CARD,
      fakeClient(
        publicTables(key, {
          card_id: CARD,
          median: 35,
          low: 30,
          high: 40,
          n_sales: 8,
          status: "sample",
          query_key: key,
          matched_at: "2026-10-01T12:00:00.000Z",
        }),
      ),
    );
    assert.equal(result.status, "sample");
    assert.deepEqual(result.sales, []);
    assert.equal(result.medianCents, null);
    assert.equal(result.p25Cents, null);
    assert.equal(result.p75Cents, null);
    const html = renderPreview(result);
    assert.match(html, new RegExp(SAMPLE_COMPS_LABEL));
    assert.equal(html.includes("$"), false);
    assert.equal(html.includes("Fair price"), false);
  });

  it("drops a stored price when the card identity no longer matches", async () => {
    const key = publicCardQueryKey(identityRow());
    const result = await getPublicCardComps(
      CARD,
      fakeClient(
        publicTables(key, {
          card_id: CARD,
          median: 77,
          low: 70,
          high: 80,
          n_sales: 6,
          status: "ok",
          query_key: `${key}|stale`,
          matched_at: "2026-10-01T12:00:00.000Z",
        }),
      ),
    );
    assert.equal(result.status, "stale");
    assert.deepEqual(result.sales, []);
    assert.equal(result.medianCents, null);
    assert.equal(result.p25Cents, null);
    assert.equal(result.p75Cents, null);
    const html = renderPreview(result);
    assert.match(html, new RegExp(NOT_ENOUGH_RECENT_SALES));
    assert.equal(html.includes("77"), false);
    assert.equal(html.includes("Fair price"), false);
  });
});

describe("public comps verdict", () => {
  it("labels a marketplace source as Recent sold", () => {
    assert.equal(STORED_SALE_SOURCE, "Recent sold");
    assert.equal(soldSourceLabel("eBay"), "Recent sold");
    assert.equal(soldSourceLabel(" ebay "), "Recent sold");
    assert.equal(soldSourceLabel("Recent sold"), "Recent sold");
  });

  it("shows a range at nSales >= 3 when status is ok", () => {
    const comps: PublicCardComps = {
      sales: [
        { priceCents: 4000, soldAt: "2026-04-02", grade: "PSA 10", source: "eBay" },
      ],
      medianCents: 3500,
      p25Cents: 3000,
      p75Cents: 4000,
      nSales: 3,
      matchedAt: "2020-01-15T00:00:00.000Z",
      status: "ok",
    };
    const html = renderPreview(comps);
    assert.match(html, /Fair price: \$30\.00 to \$40\.00/);
    assert.match(html, /Typical: \$35\.00/);
    assert.ok(html.includes(`Fair price: ${money(30)} to ${money(40)}`));
    assert.ok(html.includes(`Typical: ${money(35)}`));
    assert.match(html, /Based on 3 recent sales · updated /);
    assert.ok(html.includes(TRAWL_SOURCE_CREDIT));
    assert.match(html, /\$40\.00/);
    assert.match(html, /PSA 10/);
    assert.match(html, /Recent sold/);
    assert.doesNotMatch(html, /· eBay/);
  });

  it("says there are not enough recent sales below 3", () => {
    const comps: PublicCardComps = {
      sales: [
        { priceCents: 2000, soldAt: "2026-02-02", grade: "PSA 10", source: "eBay" },
      ],
      medianCents: 2000,
      p25Cents: 1500,
      p75Cents: 2500,
      nSales: 2,
      matchedAt: "2026-10-01T12:00:00.000Z",
      status: "ok",
    };
    const html = renderPreview(comps);
    assert.match(html, new RegExp(NOT_ENOUGH_RECENT_SALES));
    assert.equal(html.includes("Fair price"), false);
    assert.equal(html.includes("Typical:"), false);
  });

  it("labels sample data and does not present it as real sales", () => {
    const comps: PublicCardComps = {
      sales: [
        { priceCents: 99900, soldAt: "2026-04-02", grade: "PSA 10", source: "eBay" },
      ],
      medianCents: 99900,
      p25Cents: 100,
      p75Cents: 200,
      nSales: 8,
      matchedAt: "2026-10-01T12:00:00.000Z",
      status: "sample",
    };
    const html = renderPreview(comps);
    assert.match(html, new RegExp(SAMPLE_COMPS_LABEL));
    assert.equal(html.includes("Fair price"), false);
    assert.equal(html.includes("Typical:"), false);
    assert.equal(html.includes("$999.00"), false);
    assert.equal(html.includes(TRAWL_SOURCE_CREDIT), false);
    assert.equal(html.includes("PSA 10"), false);
  });
});

describe("public comps signup", () => {
  it("links to /signup?next= the card path through safeNext", () => {
    const html = renderPreview(hiddenPublicComps(), CARD_PATH);
    assert.equal(html, "");

    const comps: PublicCardComps = {
      ...hiddenPublicComps(),
      status: "no_sales",
    };
    const linked = renderPreview(comps, CARD_PATH);
    const href = signupPath(CARD_PATH);
    assert.equal(href, `/signup?next=${encodeURIComponent(safeNext(CARD_PATH))}`);
    assert.ok(linked.includes(`href="${href}"`));
    assert.match(linked, /Sign up free to see full history, charts and alerts/);

    const rejected = renderPreview(comps, "https://evil.example/phish");
    assert.ok(rejected.includes('href="/signup?next=%2F"'));
    assert.equal(rejected.includes("evil.example"), false);
  });

  it("tracks signup through the scrub and sends no card values or ids", () => {
    const sent: { name: string; props?: Record<string, string> }[] = [];
    trackPublicCompsCta((name, props) => {
      sent.push({ name, props });
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.name, "signup_started");
    assert.deepEqual(sent[0]?.props, { source: "card_comps" });
    assert.deepEqual(sanitizeProps({ source: "card_comps", median: 35, cardId: CARD }), {
      source: "card_comps",
    });
    const tracker = read("components/public-card-comps.tsx");
    const body = tracker.slice(
      tracker.indexOf("function trackPublicCompsCta"),
      tracker.indexOf("export function PublicCardCompsPreview"),
    );
    assert.match(body, /signup_started/);
    assert.match(body, /source: "card_comps"/);
    assert.equal(body.includes(CARD), false);
    assert.equal(body.includes("median"), false);
    assert.equal(body.includes("priceCents"), false);
  });
});

describe("signed-in comps stay in place", () => {
  it("keeps the full comps section on the public card and the owner card", () => {
    const view = read("components/public-card-view.tsx");
    const detail = read("components/card-detail.tsx");
    assert.match(view, /<CompsList/);
    assert.match(view, /<ValueChart/);
    assert.match(view, /<WantButton/);
    assert.doesNotMatch(view, /<FairPriceCheck/);
    assert.match(view, /soldNotice/);
    assert.match(view, /useSoldComps/);
    assert.match(detail, /to see sold comps/);
    assert.equal(view.includes("to see sold comps"), false);
    assert.match(view, /PublicCardCompsPreview/);
    assert.match(view, /publicComps\.status === "hidden"/);
  });
});
