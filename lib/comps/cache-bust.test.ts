import assert from "node:assert/strict";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { before, describe, it } from "node:test";
import type { SoldCompCard } from "@/lib/comps/types";

const ROOT = process.cwd();
const BANNED = /\brevalidate(?:Tag|Path|Card)\b/;
const ENTRIES = [
  "lib/comps/cache.ts",
  "lib/comps/index.ts",
  "lib/value/getCardValue.ts",
];

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function resolveImport(fromFile: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join(ROOT, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(join(ROOT, fromFile)), spec)
      : null;
  if (!base) return null;
  const candidates = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), base];
  return (
    candidates.find((candidate) => {
      try {
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    }) ?? null
  );
}

/** Project files a module can call, following static imports. */
function reachable(entry: string, seen = new Set<string>()): string[] {
  const rel = entry.startsWith(ROOT) ? entry.slice(ROOT.length + 1) : entry;
  if (seen.has(rel)) return [];
  seen.add(rel);
  const text = source(rel);
  const found = [rel];
  for (const match of text.matchAll(/from ["']([^"']+)["']/g)) {
    const next = resolveImport(rel, match[1]);
    if (next) found.push(...reachable(next, seen));
  }
  return found;
}

describe("comps cache bust stays in request scope", () => {
  it("cannot reach revalidateTag, revalidatePath, or revalidateCard from a comps write", () => {
    const hits: string[] = [];
    for (const entry of ENTRIES) {
      for (const file of reachable(entry)) {
        if (BANNED.test(source(file))) hits.push(`${entry} -> ${file}`);
      }
    }
    assert.deepEqual(hits, []);
  });

  it("notifies matched sales after a successful live write", async () => {
    const calls = (globalThis as { __slabholdNotifyCalls?: unknown[][] }).__slabholdNotifyCalls ?? [];
    assert.ok(calls.length >= 1);
    const [card, sales] = calls[0] as [SoldCompCard, { itemId?: string }[]];
    assert.equal(card.playerName, "Victor Wembanyama");
    assert.equal(sales.some((sale) => sale.itemId === "ok"), true);
  });
});

const nodeRequire = createRequire(import.meta.url);
const serverOnlyEmpty = pathToFileURL(
  nodeRequire.resolve("server-only").replace(/index\.js$/, "empty.js"),
).href;
const stubDir = join(tmpdir(), "slabhold-cache-bust");
mkdirSync(stubDir, { recursive: true });
const adminStub = join(stubDir, "admin.mjs");
const dispatchStub = join(stubDir, "dispatch.mjs");
writeFileSync(
  adminStub,
  `export function createSupabaseAdmin() {
    return globalThis.__slabholdFakeAdmin;
  }
`,
);
writeFileSync(
  dispatchStub,
  `export async function notifyMatchedSales(...args) {
    globalThis.__slabholdNotifyCalls.push(args);
    return 1;
  }
`,
);

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

const hookFlag = "__slabholdCacheBustHook";
if (!(globalThis as Record<string, unknown>)[hookFlag]) {
  (globalThis as Record<string, unknown>)[hookFlag] = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") return { url: serverOnlyEmpty, shortCircuit: true };
      if (specifier === "@/lib/supabase/admin" || specifier.endsWith("/supabase/admin")) {
        return { url: pathToFileURL(adminStub).href, shortCircuit: true };
      }
      if (specifier === "@/lib/wants/dispatch" || specifier.endsWith("/wants/dispatch")) {
        return { url: pathToFileURL(dispatchStub).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}

type QueryResult = { data: unknown; error: { message: string } | null };

function fakeAdmin() {
  return {
    from() {
      const self = {
        select() {
          return self;
        },
        delete() {
          return self;
        },
        insert() {
          return self;
        },
        eq() {
          return self;
        },
        order() {
          return self;
        },
        limit() {
          return self;
        },
        maybeSingle(): Promise<QueryResult> {
          return Promise.resolve({ data: null, error: null });
        },
        then(
          resolve: (value: QueryResult) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return self;
    },
  };
}

const g = globalThis as {
  __slabholdFakeAdmin?: ReturnType<typeof fakeAdmin>;
  __slabholdNotifyCalls?: unknown[][];
};
g.__slabholdFakeAdmin = fakeAdmin();
g.__slabholdNotifyCalls = [];

const previousSource = process.env.COMPS_SOURCE;
const previousKey = process.env.TRAWL_API_KEY;
process.env.COMPS_SOURCE = "trawl";
process.env.TRAWL_API_KEY = "test-key";

const TITLE = "2023-24 Panini Prizm Victor Wembanyama #136";

before(async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        site: "EBAY_US",
        currency: "USD",
        query: [TITLE],
        count: 1,
        credits_charged: 1,
        results: [
          {
            title: TITLE,
            sale_price: 40,
            shipping_price: 0,
            currency: "USD",
            condition: "used",
            condition_raw: "Pre-Owned",
            date_sold: "2026-09-01T00:00:00.000Z",
            buying_format: "Buy It Now",
            item_id: "ok",
            item_link: "https://www.ebay.com/itm/ok",
            image_url: null,
            details: {
              listing_state: "sold",
              grading: { graded: false, grader: null, grade: null, condition: null },
              sales: [
                {
                  date_sold: "2026-09-01T00:00:00.000Z",
                  sale_price: 40,
                  shipping_price: 0,
                  currency: "USD",
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    const { getSoldComps } = await import("./index");
    const result = await getSoldComps({
      id: "ba95893e-89fe-4735-be3f-1509b6b6f3b9",
      playerName: "Victor Wembanyama",
      year: 2023,
      yearLabel: "2023-24",
      setBrand: "Panini Prizm",
      cardNumber: "136",
      parallel: "Base",
      conditionType: "raw",
      grade: "Raw",
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.payload.cached, false);
    assert.ok((g.__slabholdNotifyCalls ?? []).length >= 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSource == null) delete process.env.COMPS_SOURCE;
    else process.env.COMPS_SOURCE = previousSource;
    if (previousKey == null) delete process.env.TRAWL_API_KEY;
    else process.env.TRAWL_API_KEY = previousKey;
  }
});
