import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { createElement, act, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CollectionContext, CollectionProvider } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { VisibilityChoice } from "@/components/visibility-choice";
import { PUBLIC_CARD_SELECT, mapPublicCard } from "@/lib/social/cards";
import type { SportsCard } from "@/lib/types";
import { writeFirstCardPrivacyPending } from "@/lib/collection/first-card-privacy";
import { SaveTimeoutError, SAVE_TIMEOUT_MESSAGE } from "@/lib/save/attempt";
import type { CardInput } from "@/lib/types";
import {
  clearNewCardDraft,
  newCardSeed,
  writeNewCardDraft,
  type CardDraftForm,
  type NewCardDraft,
} from "./new-card-draft";
import {
  PRIVATE_VISIBILITY_HINT,
  PRIVATE_VISIBILITY_NUDGE,
  readVisibilityChoice,
  visibilityChoiceKey,
  writeBrowserVisibilityChoice,
  writeVisibilityChoice,
  type VisibilityStore,
} from "./visibility-choice";

const nodeRequire = createRequire(import.meta.url);
const serverOnlyEmpty = pathToFileURL(
  nodeRequire.resolve("server-only").replace(/index\.js$/, "empty.js"),
).href;
const registerHooks = (
  nodeRequire("node:module") as {
    registerHooks?: (hooks: {
      resolve: (
        specifier: string,
        context: object,
        nextResolve: (specifier: string, context: object) => { url: string },
      ) => { url: string; shortCircuit?: boolean };
    }) => void;
  }
).registerHooks;
if (!registerHooks) {
  throw new Error("node:module registerHooks is required to import server-only modules in tests");
}
const serverOnlyHookFlag = "__slabholdServerOnlyTestHook";
if (!(globalThis as Record<string, unknown>)[serverOnlyHookFlag]) {
  (globalThis as Record<string, unknown>)[serverOnlyHookFlag] = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") return { url: serverOnlyEmpty, shortCircuit: true };
      return nextResolve(specifier, context);
    },
  });
}

let CardDetailView: ComponentType<{ id: string }> | null = null;

async function loadCardDetail() {
  if (!CardDetailView) {
    ({ CardDetail: CardDetailView } = await import("@/components/card-detail"));
  }
  return CardDetailView;
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function memoryStore(seed: Record<string, string> = {}): VisibilityStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

describe("saved card visibility", () => {
  it("keeps a missing choice private and does not share it across accounts", () => {
    const store = memoryStore();
    assert.equal(readVisibilityChoice(store, "ada"), null);
    assert.equal(readVisibilityChoice(store, "bea"), null);
    writeVisibilityChoice(store, "ada", true);
    assert.equal(readVisibilityChoice(store, "ada"), true);
    assert.equal(readVisibilityChoice(store, "bea"), null);
    assert.equal(store.getItem(visibilityChoiceKey("ada")), "public");
    writeVisibilityChoice(store, "ada", false);
    assert.equal(readVisibilityChoice(store, "ada"), false);
    store.setItem(visibilityChoiceKey("ada"), "maybe");
    assert.equal(readVisibilityChoice(store, "ada"), null);
    assert.equal(readVisibilityChoice(memoryStore({ "slabhold.card-visibility.bea": "public" }), "ada"), null);
  });

  it("keeps the paid sentence because public cards and the public card page omit it", () => {
    assert.equal(
      PRIVATE_VISIBILITY_NUDGE,
      "Public cards can get offers and want alerts. Your price paid stays private.",
    );
    assert.equal(PRIVATE_VISIBILITY_NUDGE.includes("\n"), false);
    assert.doesNotMatch(PUBLIC_CARD_SELECT, /paid_price/);
    assert.match(read("lib/social/remote.ts"), /public_cards — no paid_price/);
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      user_id: "user-1",
      player: "Victor Wembanyama",
      year: 2023,
      set: "Panini Prizm",
      grade: "Raw",
      parallel: "Base",
      estimated_value: 10,
      image_url: null,
      card_number: "136",
      sport: "Basketball",
      accent: "#7c5cff",
      year_label: "2023-24",
      set_name: "Panini Prizm",
      paid_price: 999,
    };
    const mapped = mapPublicCard(row);
    assert.equal(mapped.purchasePrice, null);
    // The public card page shows no paid amount at all.
    const view = read("components/public-card-view.tsx");
    assert.doesNotMatch(view, />Paid<|label="Paid"|"Paid"/);
    assert.match(read("app/(app)/u/[username]/cards/[id]/page.tsx"), /PublicCardView/);
  });
});

describe("visibility controls", () => {
  it("shows one private line and 44px options that wrap", () => {
    const privateHtml = renderToStaticMarkup(
      createElement(VisibilityChoice, {
        isPublic: false,
        onChange() {},
        hint: PRIVATE_VISIBILITY_NUDGE,
      }),
    );
    assert.match(privateHtml, /Public cards can get offers and want alerts\. Your price paid stays private\./);
    assert.match(privateHtml, /role="radiogroup"/);
    assert.match(privateHtml, /aria-label="Who can see this card"/);
    assert.match(privateHtml, /min-h-11/);
    assert.match(privateHtml, /min-w-0 max-w-full flex-wrap/);
    assert.match(privateHtml, /break-words/);
    assert.match(privateHtml, /basis-\[7\.5rem\]/);
    assert.match(privateHtml, /aria-checked="false"[^>]*>Public/);
    assert.match(privateHtml, /aria-checked="true"[^>]*>Private/);

    const publicHtml = renderToStaticMarkup(
      createElement(VisibilityChoice, {
        isPublic: true,
        onChange() {},
        hint: "Cards are private by default. You can show them on your profile.",
      }),
    );
    assert.doesNotMatch(publicHtml, /Your price paid stays private/);
    assert.match(publicHtml, /aria-checked="true"[^>]*>Public/);
    assert.match(publicHtml, /Cards are private by default\. You can show them on your profile\./);

  });

  it("puts the segment at the top of add card and leaves share-to-feed off", () => {
    const form = read("components/card-form.tsx");
    // Add card: right under the photo buttons, which stay the first controls (guided
    // picker and sectioned add). Edit: right under the title.
    assert.match(form, /photoBlock=\{[\s\S]{0,160}\{photoNode\}\s*\{visibilityNode\}/);
    assert.match(form, /\{visibleNodes\[key\]\}[\s\S]{0,120}\{key === "photo" \? visibilityNode : null\}/);
    assert.match(form, /\{headerNode\}\s*\{visibilityNode\}\s*\{categoryNode\}/);
    assert.equal(form.match(/\{visibilityNode\}/g)?.length, 2);
    assert.match(form, /const visibilityNode = \(\s*<VisibilityChoice/);
    assert.doesNotMatch(form, /isPublic: publicNode/);
    assert.doesNotMatch(read("lib/cards/add-form-sections.ts"), /"isPublic"/);
    assert.equal(form.includes("Show this card on your public profile"), false);
    assert.match(form, /shareChoice \?\? rememberedShare \?\? false/);
    assert.match(
      form,
      /restored\?\.share \?\? \(existing \? Boolean\(existing\.isPublic\) : null\)/,
    );
    assert.match(form, /useState\(restored\?\.shareToFeed \?\? false\)/);
    assert.match(form, /PRIVATE_VISIBILITY_HINT/);
    assert.equal(
      PRIVATE_VISIBILITY_HINT,
      "Cards are private by default. Your price paid stays private.",
    );
    assert.equal(PRIVATE_VISIBILITY_HINT.split(". ").length, 2);
    assert.match(form, /if \(!next\) \{\s*setOpenToOffers\(false\);\s*setShareToFeed\(false\);/);
  });

  it("leaves the owner page on the card page switch and drops the nudge only after a save", () => {
    const detail = read("components/card-detail.tsx");
    assert.doesNotMatch(detail, /MakePublicChip|Make public/);
    assert.match(detail, /<CardVisibilitySwitch/);
    assert.match(read("app/(app)/cards/[id]/page.tsx"), /requireCardPageAccess/);
    assert.doesNotMatch(read("components/public-card-view.tsx"), /Make public|MakePublicChip/);
    const setPublic = detail.slice(detail.indexOf("function setPublic("), detail.indexOf("return (", detail.indexOf("function setPublic(")));
    assert.match(setPublic, /result\.saved\.then\(/);
    assert.doesNotMatch(setPublic, /if \(next\) dismissPrivacyNudge\(\);/);
  });
});

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as {
  AppRouterContext: {
    Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode;
  };
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000/cards/new",
  pretendToBeVisual: true,
});
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("self", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("HTMLInputElement", win.HTMLInputElement);
expose("HTMLSelectElement", win.HTMLSelectElement);
expose("HTMLTextAreaElement", win.HTMLTextAreaElement);
expose("HTMLFormElement", win.HTMLFormElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("localStorage", win.localStorage);
expose("sessionStorage", win.sessionStorage);
expose("requestAnimationFrame", win.requestAnimationFrame.bind(win));
expose("cancelAnimationFrame", win.cancelAnimationFrame.bind(win));
expose("fetch", async () => new win.Response(null, { status: 404 }));
expose("IS_REACT_ACT_ENVIRONMENT", true);

const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

type CardFormProps = { existing?: SportsCard; initialQuery?: string };
let CardForm: ComponentType<CardFormProps>;

const savedCard: SportsCard = {
  id: "saved-private",
  playerName: "Jaylen Brown",
  year: 2024,
  yearLabel: "2024",
  setBrand: "Panini Prizm",
  setIsCustom: false,
  cardNumber: "1",
  noNumber: false,
  grade: "Raw",
  parallel: "Base",
  parallelIsCustom: false,
  serialRun: null,
  serialNo: null,
  isRookie: false,
  isAuto: false,
  isRelic: false,
  conditionType: "raw",
  gradeQualifier: "",
  certNumber: "",
  sport: "Basketball",
  purchasePrice: 25,
  purchaseDate: "2024-01-02",
  estimatedSellPrice: 0,
  sellPrice: null,
  sellDate: null,
  notes: "",
  photoDataUrl: null,
  accent: "#7c5cff",
  isPublic: false,
  createdAt: "2024-01-02T00:00:00.000Z",
  updatedAt: "2024-01-02T00:00:00.000Z",
};

function Harness({ userId, children }: { userId: string | null; children?: ReactNode }) {
  const social = useMemo(
    () => ({
      ready: true,
      mode: "local" as const,
      user: userId ? { id: userId } : null,
      createPost: async () => ({ error: null, postId: null }),
    }),
    [userId],
  );
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      SocialContext.Provider,
      { value: social as never },
      createElement(CollectionProvider, null, children),
    ),
  );
}

function radioChecked(label: "Public" | "Private"): boolean {
  const match = [...win.document.querySelectorAll('[role="radio"]')].find(
    (node) => node.textContent?.trim() === label,
  );
  assert.ok(match instanceof win.HTMLButtonElement);
  return match.getAttribute("aria-checked") === "true";
}

function shareToFeedChecked(): boolean {
  const match = [...win.document.querySelectorAll("label")].find((node) =>
    node.textContent?.includes("Share to feed"),
  );
  const box = match?.querySelector("input");
  assert.ok(box instanceof win.HTMLInputElement);
  return box.checked;
}

function filledDraft(userId: string, share: boolean): NewCardDraft {
  const form: CardDraftForm = {
    playerName: "Jaylen Brown",
    yearLabel: "2024",
    setBrand: "Test Set",
    cardNumber: "136",
    parallel: "Base",
    serialRun: "",
    serialNo: "",
    sport: "Basketball",
    purchasePrice: "",
    purchaseDate: "",
    estimatedSellPrice: "",
    sellPrice: "",
    sellDate: "",
    notes: "",
  };
  return {
    seed: newCardSeed("", null),
    userId,
    pendingId: null,
    hadPhoto: false,
    form,
    noNumber: false,
    setIsCustom: true,
    parallelIsCustom: false,
    gradeCompany: "Raw / Ungraded",
    gradeNumber: "",
    gradeQualifier: "",
    certNumber: "",
    isRookie: false,
    isAuto: false,
    isRelic: false,
    sold: false,
    share,
    openToOffers: false,
    shareToFeed: false,
    caption: "",
    category: "pc",
    sportTouched: false,
    sportOffer: "",
    unknownPurchase: false,
  };
}

const visibilityScript = { timeouts: 0, fails: 0 };

function resetTimeoutScript() {
  visibilityScript.timeouts = 0;
}

function resetVisibilityScript() {
  visibilityScript.fails = 1;
}

function timeoutAdd(input: CardInput & { id?: string }) {
  visibilityScript.timeouts += 1;
  const now = new Date().toISOString();
  const card = {
    ...input,
    id: input.id ?? "timeout-card",
    createdAt: now,
    updatedAt: now,
  } as SportsCard;
  if (visibilityScript.timeouts === 1) {
    const saved = Promise.reject(new SaveTimeoutError(null));
    void saved.catch(() => undefined);
    return { card, saved };
  }
  return { card, saved: Promise.resolve() };
}

function visibilityUpdate(previous: SportsCard, id: string, patch: Partial<SportsCard>) {
  if (visibilityScript.fails > 0) {
    visibilityScript.fails -= 1;
    const saved = Promise.reject(new Error("Could not save this card."));
    void saved.catch(() => undefined);
    return { card: previous, saved, failed: true };
  }
  const card = { ...previous, ...patch, id, updatedAt: new Date().toISOString() };
  return { card, saved: Promise.resolve(), failed: false };
}

function TimeoutCollection({ children }: { children?: ReactNode }) {
  const [cards, setCards] = useState<SportsCard[]>([]);
  const value = {
    ready: true,
    loaded: true,
    loadFailed: false,
    cards,
    syncError: null,
    getCard(id: string) {
      return cards.find((card) => card.id === id);
    },
    addCard(input: CardInput & { id?: string }) {
      const result = timeoutAdd(input);
      setCards([result.card]);
      return result;
    },
    updateCard(id: string, patch: Partial<SportsCard>) {
      const previous = cards.find((card) => card.id === id);
      const card = {
        ...(previous as SportsCard),
        ...patch,
        id,
        updatedAt: new Date().toISOString(),
      };
      setCards([card]);
      return { card, saved: Promise.resolve() };
    },
    removeCard() {
      setCards([]);
    },
    reload() {},
  };
  return createElement(CollectionContext.Provider, { value: value as never }, children);
}

function DetailCollection({
  initial,
  children,
}: {
  initial: SportsCard;
  children?: ReactNode;
}) {
  const [cards, setCards] = useState<SportsCard[]>([initial]);
  const value = {
    ready: true,
    loaded: true,
    loadFailed: false,
    cards,
    syncError: null,
    getCard(id: string) {
      return cards.find((card) => card.id === id);
    },
    addCard(input: CardInput & { id?: string }) {
      const now = new Date().toISOString();
      const card = { ...initial, ...input, id: input.id ?? "added", createdAt: now, updatedAt: now };
      setCards([card]);
      return { card, saved: Promise.resolve() };
    },
    updateCard(id: string, patch: Partial<SportsCard>) {
      const previous = cards.find((card) => card.id === id) ?? initial;
      const result = visibilityUpdate(previous, id, patch);
      if (!result.failed) setCards([result.card]);
      return { card: result.card, saved: result.saved };
    },
    removeCard() {},
    reload() {},
  };
  return createElement(CollectionContext.Provider, { value: value as never }, children);
}

function textIncludes(value: string): boolean {
  return win.document.body.textContent?.includes(value) === true;
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  throw new Error(win.document.body.textContent?.slice(0, 500) ?? "timed out");
}

async function submitForm() {
  const form = win.document.querySelector("form");
  assert.ok(form);
  await act(async () => {
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
  });
}

function visibilitySwitch() {
  return win.document.querySelector('[data-slot="card-visibility"] [role="switch"]');
}

function switchState(): boolean | null {
  const node = visibilitySwitch();
  return node ? node.getAttribute("aria-checked") === "true" : null;
}

async function clickSwitch() {
  const node = visibilitySwitch();
  assert.ok(node instanceof win.HTMLButtonElement);
  await act(async () => {
    node.click();
  });
}

async function mount(userId: string | null, props: CardFormProps = {}) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness, { userId }, createElement(CardForm, props)));
  });
  return {
    unmount() {
      root.unmount();
      host.remove();
    },
  };
}

async function mountCustom(userId: string | null, collection: ReactNode) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  const social = {
    ready: true,
    hasFullSnapshot: true,
    loadingPostId: null,
    mode: "local" as const,
    user: userId ? { id: userId, username: "ada" } : null,
    profiles: [],
    posts: [],
    publicCards: [],
    homePosts: [],
    homeReposts: [],
    follows: [],
    notifications: [],
    messages: [],
    blockedIds: [],
    mutedIds: [],
    suggestions: [],
    removedPostIds: new Set<string>(),
    postCardValues: new Map(),
    createPost: async () => ({ error: null, postId: null }),
    isFollowing: () => false,
    followerCount: () => 0,
    followingCount: () => 0,
    followersOf: () => [],
    followingOf: () => [],
    isLiked: () => false,
    isReposted: () => false,
    likeCount: () => 0,
    repostCount: () => 0,
    commentsFor: () => [],
    profileByUsername: () => undefined,
    findPost: () => undefined,
  };
  await act(async () => {
    root.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(SocialContext.Provider, { value: social as never }, collection),
      ),
    );
  });
  return {
    unmount() {
      root.unmount();
      host.remove();
    },
  };
}

describe("add card visibility nudge", () => {
  before(async () => {
    ({ CardForm } = await import("@/components/card-form"));
  });

  after(() => {
    win.close();
  });

  it("starts private, then uses that account's saved choice without turning on share to feed", async () => {
    win.localStorage.clear();
    const fresh = await mount("ada");
    try {
      assert.equal(radioChecked("Private"), true);
      assert.equal(radioChecked("Public"), false);
      assert.equal(win.document.body.textContent?.includes(PRIVATE_VISIBILITY_HINT), true);
      assert.equal(win.document.body.textContent?.includes(PRIVATE_VISIBILITY_NUDGE), false);
      assert.equal(shareToFeedChecked(), false);
    } finally {
      fresh.unmount();
    }

    writeBrowserVisibilityChoice("ada", true);
    const again = await mount("ada");
    try {
      assert.equal(radioChecked("Public"), true);
      assert.equal(win.document.body.textContent?.includes(PRIVATE_VISIBILITY_HINT), false);
      assert.equal(win.document.body.textContent?.includes("Your price paid stays private."), false);
      assert.equal(shareToFeedChecked(), false);
    } finally {
      again.unmount();
    }

    const other = await mount("bea");
    try {
      assert.equal(radioChecked("Private"), true);
      assert.equal(win.document.body.textContent?.includes(PRIVATE_VISIBILITY_HINT), true);
    } finally {
      other.unmount();
    }

    const guest = await mount(null);
    try {
      assert.equal(radioChecked("Private"), true);
    } finally {
      guest.unmount();
    }

    const editing = await mount("ada", { existing: savedCard });
    try {
      assert.equal(radioChecked("Private"), true);
      assert.equal(radioChecked("Public"), false);
    } finally {
      editing.unmount();
    }
  });

  it("remembers visibility only after a confirmed save, not when the save times out", async () => {
    win.localStorage.clear();
    clearNewCardDraft();
    resetTimeoutScript();
    writeNewCardDraft(filledDraft("ada", true));
    const view = await mountCustom("ada", createElement(TimeoutCollection, null, createElement(CardForm, {})));
    try {
      await waitFor(() => radioChecked("Public"));
      await submitForm();
      await waitFor(() => textIncludes(SAVE_TIMEOUT_MESSAGE));
      assert.equal(win.localStorage.getItem(visibilityChoiceKey("ada")), null);
      await submitForm();
      await waitFor(() => win.localStorage.getItem(visibilityChoiceKey("ada")) === "public");
    } finally {
      view.unmount();
      clearNewCardDraft();
    }
  });

  it("keeps the first-card nudge after a failed Public save and drops it after the retry saves", async () => {
    win.localStorage.clear();
    resetVisibilityScript();
    writeFirstCardPrivacyPending(win.localStorage, "ada", savedCard.id);
    const CardDetail = await loadCardDetail();
    const view = await mountCustom(
      "ada",
      createElement(DetailCollection, { initial: savedCard }, createElement(CardDetail, { id: savedCard.id })),
    );
    try {
      await waitFor(() => switchState() === false && textIncludes("Only you can see this card"));
      await clickSwitch();
      await waitFor(() => textIncludes("Couldn't save. Tap to try again."));
      assert.equal(switchState(), false);
      assert.equal(textIncludes("Only you can see this card"), true);
      await clickSwitch();
      await waitFor(() => switchState() === true && textIncludes("Saved"));
      await waitFor(() => !textIncludes("Only you can see this card"));
    } finally {
      view.unmount();
    }
  });

  it("shows an error when switching a public card back to private fails", async () => {
    win.localStorage.clear();
    resetVisibilityScript();
    const publicCard = { ...savedCard, id: "saved-public", isPublic: true };
    const CardDetail = await loadCardDetail();
    const view = await mountCustom(
      "ada",
      createElement(
        DetailCollection,
        { initial: publicCard },
        createElement(CardDetail, { id: publicCard.id }),
      ),
    );
    try {
      await waitFor(() => switchState() === true);
      await clickSwitch();
      await waitFor(() => textIncludes("Couldn't save. Tap to try again."));
      assert.equal(switchState(), true);
    } finally {
      view.unmount();
    }
  });
});
