import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { missingRecordAction, readPublicCardLookup, type LookupClient } from "./missing-record";

const CARD = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
const OWNER = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, unknown> | null;

/** profiles by username and public_cards by id. A private card has no public_cards row. */
function fakeClient(tables: {
  profile?: Row;
  card?: Row;
  profileError?: boolean;
  cardError?: boolean;
}) {
  const log: { table: string; started: number; settled?: number }[] = [];
  let clock = 0;
  const client: LookupClient = {
    from(table) {
      const entry = { table, started: clock++ } as (typeof log)[number];
      log.push(entry);
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          entry.settled = clock++;
          const isProfile = table === "profiles";
          const error = isProfile ? tables.profileError : tables.cardError;
          return {
            data: error ? null : ((isProfile ? tables.profile : tables.card) ?? null),
            error: error ? { message: "boom" } : null,
          };
        },
      };
      return chain;
    },
  };
  return { client, log };
}

describe("public card lookup", () => {
  it("404s a private card: no public_cards row", async () => {
    const { client } = fakeClient({ profile: { id: OWNER }, card: null });
    const lookup = await readPublicCardLookup(client, "maya", CARD);
    assert.equal(lookup, "missing");
    assert.equal(missingRecordAction(lookup), "notFound");
  });

  it("404s a public card under the wrong owner's URL", async () => {
    const { client } = fakeClient({ profile: { id: OWNER }, card: { id: CARD, user_id: "someone-else" } });
    assert.equal(await readPublicCardLookup(client, "maya", CARD), "missing");
  });

  it("404s a missing profile, a bad id and a blank username", async () => {
    const { client } = fakeClient({ profile: null, card: { id: CARD, user_id: OWNER } });
    assert.equal(await readPublicCardLookup(client, "nobody", CARD), "missing");
    assert.equal(await readPublicCardLookup(client, "maya", "not-a-uuid"), "missing");
    assert.equal(await readPublicCardLookup(client, "  ", CARD), "missing");
  });

  it("finds the owner's public card", async () => {
    const { client } = fakeClient({ profile: { id: OWNER }, card: { id: CARD, user_id: OWNER } });
    assert.equal(await readPublicCardLookup(client, "Maya", CARD), "found");
  });

  it("leaves lookup errors on the page", async () => {
    const a = fakeClient({ profileError: true, card: { id: CARD, user_id: OWNER } });
    assert.equal(await readPublicCardLookup(a.client, "maya", CARD), "error");
    const b = fakeClient({ profile: { id: OWNER }, cardError: true });
    assert.equal(await readPublicCardLookup(b.client, "maya", CARD), "error");
  });

  it("starts the profile and card reads together", async () => {
    const { client, log } = fakeClient({ profile: { id: OWNER }, card: { id: CARD, user_id: OWNER } });
    await readPublicCardLookup(client, "maya", CARD);
    assert.deepEqual(log.map((entry) => entry.table).sort(), ["profiles", "public_cards"]);
    const lastStart = Math.max(...log.map((entry) => entry.started));
    const firstSettle = Math.min(...log.map((entry) => entry.settled ?? Infinity));
    assert.ok(lastStart < firstSettle, "both reads start before either settles");
  });

  it("has no local-mode client: unconfigured stays on the page", async () => {
    assert.equal(await readPublicCardLookup(null, "maya", CARD), "unconfigured");
  });
});

describe("public card page caching", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("reads without cookies, so the page can be served from the CDN", () => {
    const source = read("lib/social/require-record.ts");
    const body = source.slice(source.indexOf("export const requirePublicCard"));
    assert.doesNotMatch(body, /createSupabaseServer/);
    assert.match(body, /createAnonReader\(\) as LookupClient/);
    assert.match(body, /cardCacheTag\(cardId\)/);
  });

  it("is ISR with a 5 minute window and renders new ids on first hit", () => {
    const page = read("app/u/[username]/cards/[id]/page.tsx");
    assert.match(page, /export const revalidate = 300;/);
    assert.match(page, /export const dynamicParams = true;/);
    assert.match(page, /export function generateStaticParams\(\)[\s\S]{0,80}?\{\s*return \[\];/);
  });

  it("has a loading boundary that matches the page", () => {
    const loading = read("app/u/[username]/cards/[id]/loading.tsx");
    assert.match(loading, /PublicCardSkeleton/);
  });
});
