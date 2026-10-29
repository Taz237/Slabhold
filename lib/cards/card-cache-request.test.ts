import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { postCardCacheRefresh, type CardCacheDeps } from "./card-cache-request";

const CARD = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";

function deps(over: Partial<CardCacheDeps> = {}) {
  const busted: string[] = [];
  const value: CardCacheDeps = {
    getUserId: async () => ME,
    cardOwner: async () => ME,
    revalidate: (cardId) => busted.push(cardId),
    ...over,
  };
  return { value, busted };
}

function post(body: unknown) {
  return new Request("http://local/api/cards/cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("card cache refresh", () => {
  it("busts card:id when the owner flips visibility", async () => {
    const { value, busted } = deps();
    const res = await postCardCacheRefresh(post({ cardId: CARD }), value);
    assert.equal(res.status, 200);
    assert.deepEqual(busted, [CARD]);
  });

  it("busts a card that was just deleted", async () => {
    const { value, busted } = deps({ cardOwner: async () => null });
    const res = await postCardCacheRefresh(post({ cardId: CARD }), value);
    assert.equal(res.status, 200);
    assert.deepEqual(busted, [CARD]);
  });

  it("needs a signed-in owner and a real id", async () => {
    const signedOut = deps({ getUserId: async () => null });
    assert.equal((await postCardCacheRefresh(post({ cardId: CARD }), signedOut.value)).status, 401);
    assert.deepEqual(signedOut.busted, []);

    const other = deps({ cardOwner: async () => THEM });
    assert.equal((await postCardCacheRefresh(post({ cardId: CARD }), other.value)).status, 403);
    assert.deepEqual(other.busted, []);

    const bad = deps();
    assert.equal((await postCardCacheRefresh(post({ cardId: "nope" }), bad.value)).status, 400);
    assert.equal((await postCardCacheRefresh(post(null), bad.value)).status, 400);
    assert.deepEqual(bad.busted, []);
  });

  it("is pinged after a visibility save and a delete", () => {
    const provider = readFileSync(join(process.cwd(), "components/collection-provider.tsx"), "utf8");
    assert.match(provider, /previous\.isPublic !== updated\.isPublic[\s\S]*pingCardCache\(id\)/);
    assert.match(provider, /removeUserCard\([\s\S]*pingCardCache\(id\)/);
    const route = readFileSync(join(process.cwd(), "app/api/cards/cache/route.ts"), "utf8");
    assert.match(route, /revalidateTag\(cardVisibilityTag\(cardId\)/);
    // Only the visibility reads carry the tag; the comps caches stay put.
    const lookup = readFileSync(join(process.cwd(), "lib/social/require-record.ts"), "utf8");
    assert.match(lookup, /cardVisibilityTag\(cardId\)/);
    const comps = readFileSync(join(process.cwd(), "lib/comps/public.ts"), "utf8");
    assert.match(comps, /cardVisibilityTag\(cardKey\)/);
  });
});
