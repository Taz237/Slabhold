import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement, useContext, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext, type SocialContextValue } from "@/components/social-provider";
import { SeededSocial } from "@/components/social-seed";
import { SeededViewer } from "@/components/viewer-seed";
import { SEEDED_SOCIAL_ACTIONS } from "@/lib/social/seeded-actions";
import type { HomeSeed } from "@/lib/social/home-seed";
import type { Profile } from "@/lib/social/types";

installDom();

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

const viewer: Profile = {
  id: "v1",
  email: "ada@example.com",
  username: "ada",
  displayName: "Ada",
  bio: "",
  avatarDataUrl: null,
  coverDataUrl: null,
  accent: "#7C3AED",
  createdAt: "2025-01-01T00:00:00.000Z",
};

const homeSeed = {
  viewer,
  lane: "foryou",
  follows: [],
  blockedIds: [],
  mutedIds: [],
  page: { items: [], posts: [], relatedPosts: [], profiles: [], hasMore: false, nextCursor: null, likes: [], token: "t" },
  profiles: [viewer],
  comments: [],
  reposts: [],
  suggestions: [],
  cardCount: 0,
  getStarted: { visible: false, complete: false, steps: [] },
  newNow: false,
} as unknown as HomeSeed;

/** Every function member of the provider's value, read from its type. */
function providerFunctions(): Map<string, string> {
  const source = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
  const block = source.slice(source.indexOf("export type SocialContextValue = {"));
  const body = block.slice(0, block.indexOf("\n};"));
  const members = new Map<string, string>();
  const matches = [...body.matchAll(/^ {2}(\w+)\??: /gm)];
  matches.forEach((match, index) => {
    const end = index + 1 < matches.length ? matches[index + 1].index : body.length;
    const type = body.slice(match.index + match[0].length, end);
    if (type.trimStart().startsWith("(")) members.set(match[1], type);
  });
  return members;
}

/** The provider, every function recording when it actually runs. */
function provider(calls: string[], ready: boolean): SocialContextValue {
  const value: Record<string, unknown> = {
    ready,
    hasFullSnapshot: false,
    mode: "supabase",
    user: null,
    profiles: [],
    posts: [],
    removedPostIds: new Set<string>(),
  };
  for (const name of providerFunctions().keys()) {
    value[name] = () => {
      calls.push(name);
      return Promise.resolve({});
    };
  }
  return value as unknown as SocialContextValue;
}

/**
 * Calls every provider function through the seeded value before the
 * provider is ready, and returns the ones held back and replayed once it is.
 */
function heldBy(wrap: (child: ReactElement) => ReactElement): Set<string> {
  const calls: string[] = [];
  let seen: SocialContextValue | null = null;
  function Probe() {
    seen = useContext(SocialContext);
    return null;
  }
  const collection = { ready: false, cards: [], syncError: null, getCard: () => undefined, removeCard: () => {}, reload: () => {} };
  const tree = (ready: boolean) =>
    createElement(
      SocialContext.Provider,
      { value: provider(calls, ready) },
      createElement(CollectionContext.Provider, { value: { ...collection, ready } as never }, wrap(createElement(Probe))),
    );
  act(() => root!.render(tree(false)));
  for (const name of providerFunctions().keys()) {
    const fn: unknown = (seen as unknown as Record<string, unknown>)[name];
    assert.equal(typeof fn, "function", name);
    void Promise.resolve((fn as () => unknown)()).catch(() => undefined);
  }
  const ranAtOnce = calls.length;
  act(() => root!.render(tree(true)));
  return new Set(calls.slice(ranAtOnce));
}

describe("seeded social actions", () => {
  it("holds the same taps on a card page and Collection as on Home", () => {
    const home = heldBy((child) => createElement(SeededSocial, { seed: homeSeed }, child));
    const cards = heldBy((child) => createElement(SeededViewer, { seed: { viewer, cards: [] } }, child));
    assert.deepEqual([...cards].sort(), [...home].sort());
    assert.deepEqual([...home].sort(), [...SEEDED_SOCIAL_ACTIONS].sort());
    for (const name of ["deletePost", "pinPost", "unpinPost", "deleteComment", "applySafetyChange", "updatePost"]) {
      assert.ok(cards.has(name), name);
    }
  });

  it("holds every provider action that saves something", () => {
    for (const [name, type] of providerFunctions()) {
      if (/Promise<AuthResult/.test(type)) assert.ok(SEEDED_SOCIAL_ACTIONS.has(name), name);
    }
    for (const name of SEEDED_SOCIAL_ACTIONS) assert.ok(providerFunctions().has(name), name);
  });
});
