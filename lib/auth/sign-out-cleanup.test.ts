import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { RECENT_PLAYERS_KEY } from "@/lib/cards/add-flow-players";
import { keepComposeDraft, takeComposeDraft } from "@/lib/social/compose-draft";
import { clearSignedOutDevice, SIGN_OUT_LOCAL_KEYS, SIGN_OUT_SESSION_KEYS } from "./sign-out-cleanup";

class MemoryStore {
  map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

const HINT = "slabhold_email_hint=ada%40example.com";

function device() {
  const local = new MemoryStore();
  const session = new MemoryStore();
  const cookies: string[] = [];
  return { local, session, cookies, env: { local, session, setCookie: (c: string) => cookies.push(c) } };
}

describe("sign-out cleanup", () => {
  beforeEach(() => {
    takeComposeDraft("new");
  });

  it("clears the post composer draft, in memory and the photo handed over in sessionStorage", () => {
    const { session, env } = device();
    keepComposeDraft("new", { body: "My grails list", images: ["data:image/png;base64,AAAA"], cardId: "", quoteId: null });
    session.setItem("cardflip.compose", "data:image/png;base64,AAAA");

    clearSignedOutDevice(env);

    assert.equal(takeComposeDraft("new"), null);
    assert.equal(session.getItem("cardflip.compose"), null);
  });

  it("expires the email hint cookie", () => {
    const { cookies, env } = device();
    clearSignedOutDevice(env);
    assert.equal(cookies.length, 1);
    assert.match(cookies[0], /^slabhold_email_hint=;/);
    assert.match(cookies[0], /Max-Age=0/);
    assert.match(cookies[0], /Path=\//);
  });

  it("clears the email hint from a real document.cookie by default", async () => {
    const { installDom } = await import("@/lib/test/dom");
    const { win } = installDom();
    win.document.cookie = `${HINT}; Path=/`;
    assert.ok(win.document.cookie.includes("slabhold_email_hint=ada"));

    clearSignedOutDevice();

    assert.ok(!win.document.cookie.includes("slabhold_email_hint"));
  });

  it("drops every account's recent searches and the device's recent players", () => {
    const { local, env } = device();
    local.setItem("slabhold.search.recent.v1", "[\"old\"]");
    local.setItem("slabhold.search.recent.v1.user-1", "[\"wemby\"]");
    local.setItem("slabhold.search.recent.v1.guest", "[\"brady\"]");
    local.setItem(RECENT_PLAYERS_KEY, "[\"Caitlin Clark\"]");
    local.setItem("slabhold.utm", "{}");
    local.setItem("cardflip.cards.v1", "[]");

    clearSignedOutDevice(env);

    assert.deepEqual([...local.map.keys()].sort(), ["cardflip.cards.v1", "slabhold.utm"]);
  });

  it("drops the scan and share handoffs in sessionStorage, and keeps the rest", () => {
    const { session, env } = device();
    session.setItem("cardflip.scan", "data:image/png;base64,BBBB");
    session.setItem("slabhold.shared-post", "{\"cardId\":\"c1\",\"postId\":\"p1\"}");
    session.setItem("slabhold.pushAsk.session", "1");

    clearSignedOutDevice(env);

    assert.deepEqual([...session.map.keys()], ["slabhold.pushAsk.session"]);
  });

  it("keeps going when storage throws", () => {
    const broken = {
      get length(): number {
        throw new Error("blocked");
      },
      key: () => null,
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const cookies: string[] = [];
    keepComposeDraft("new", { body: "Still goes", images: [], cardId: "", quoteId: null });
    assert.doesNotThrow(() => clearSignedOutDevice({ local: broken, session: broken, setCookie: (c) => cookies.push(c) }));
    assert.equal(takeComposeDraft("new"), null);
    assert.equal(cookies.length, 1);
  });

  it("names the same keys the features write", () => {
    assert.ok(SIGN_OUT_LOCAL_KEYS.includes(RECENT_PLAYERS_KEY));
    assert.deepEqual([...SIGN_OUT_SESSION_KEYS].sort(), ["cardflip.compose", "cardflip.scan", "slabhold.shared-post"]);
  });
});
