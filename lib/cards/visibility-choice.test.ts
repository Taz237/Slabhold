import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { createElement, act, useMemo, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { join } from "node:path";
import { CollectionProvider } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { MakePublicChip, VisibilityChoice } from "@/components/visibility-choice";
import { PUBLIC_CARD_SELECT, mapPublicCard } from "@/lib/social/cards";
import type { SportsCard } from "@/lib/types";
import {
  PRIVATE_VISIBILITY_NUDGE,
  readVisibilityChoice,
  visibilityChoiceKey,
  writeBrowserVisibilityChoice,
  writeVisibilityChoice,
  type VisibilityStore,
} from "./visibility-choice";

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
    const view = read("components/public-card-view.tsx");
    assert.match(view, /Paid is private/);
    assert.match(view, /typeof card\.purchasePrice === "number"/);
    assert.match(read("app/u/[username]/cards/[id]/page.tsx"), /<PublicCardView/);
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

    const chip = renderToStaticMarkup(createElement(MakePublicChip, { onClick() {} }));
    assert.match(chip, />Make public</);
    assert.match(chip, /min-h-11/);
    assert.match(chip, /max-w-full min-w-0/);
  });

  it("puts the segment at the top of add card and leaves share-to-feed off", () => {
    const form = read("components/card-form.tsx");
    const choiceAt = form.indexOf("<VisibilityChoice");
    const categoryAt = form.indexOf("<CategoryPicker");
    const playerAt = form.indexOf('label="Player name"');
    const notesAt = form.indexOf('label="Notes"');
    assert.ok(choiceAt > 0 && categoryAt > choiceAt && playerAt > choiceAt && notesAt > choiceAt);
    assert.equal(form.includes("Show this card on your public profile"), false);
    assert.match(form, /shareChoice \?\? rememberedShare \?\? false/);
    assert.match(
      form,
      /restored\?\.share \?\? \(existing \? Boolean\(existing\.isPublic\) : null\)/,
    );
    assert.match(form, /useState\(restored\?\.shareToFeed \?\? false\)/);
    assert.match(form, /Cards are private by default\. You can show them on your profile\./);
    assert.match(form, /PRIVATE_VISIBILITY_NUDGE/);
    assert.match(form, /if \(!next\) \{\s*setOpenToOffers\(false\);\s*setShareToFeed\(false\);/);
    const submitStart = form.indexOf("async function submit");
    const submit = form.slice(submitStart, form.indexOf("return (", submitStart));
    const savedAt = submit.indexOf("await saved");
    const writeAt = submit.indexOf("writeBrowserVisibilityChoice");
    assert.ok(savedAt > 0 && writeAt > savedAt);
    assert.match(submit, /if \(seed != null\) \{[\s\S]*clearNewCardDraft\(\);\s*if \(user\?\.id\) writeBrowserVisibilityChoice/);
    assert.doesNotMatch(submit.slice(0, savedAt), /writeBrowserVisibilityChoice/);
  });

  it("offers Make public only to the owner of a private card and reverts a failed save", () => {
    const detail = read("components/card-detail.tsx");
    const menuAt = detail.indexOf("{menuOpen ? (");
    const chipAt = detail.indexOf("<MakePublicChip");
    assert.ok(chipAt > 0 && chipAt < menuAt);
    assert.equal(detail.indexOf("<MakePublicChip", menuAt), -1);
    const chip = detail.slice(chipAt - 80, chipAt + 280);
    assert.match(chip, /card\.isPublic \? null : \(/);
    assert.match(chip, /updateCard\(card\.id, publicTogglePatch\(card, true\)\)/);
    assert.doesNotMatch(chip, /await /);
    assert.match(detail, /flex flex-wrap items-center gap-2/);
    assert.match(read("app/cards/[id]/page.tsx"), /requireCardPageAccess/);
    assert.doesNotMatch(read("components/public-card-view.tsx"), /Make public|MakePublicChip/);

    const provider = read("components/collection-provider.tsx");
    const updateCard = provider.slice(
      provider.indexOf("const updateCard = useCallback("),
      provider.indexOf("const removeCard = useCallback("),
    );
    const paintAt = updateCard.indexOf("setCards(next)");
    const saveAt = updateCard.indexOf("await saveUserCard");
    assert.ok(paintAt > 0 && saveAt > paintAt);
    assert.match(updateCard, /if \(!isSaveTimeout\(error\)\) revert\(\)/);
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
      assert.equal(win.document.body.textContent?.includes(PRIVATE_VISIBILITY_NUDGE), true);
      assert.equal(shareToFeedChecked(), false);
    } finally {
      fresh.unmount();
    }

    writeBrowserVisibilityChoice("ada", true);
    const again = await mount("ada");
    try {
      assert.equal(radioChecked("Public"), true);
      assert.equal(win.document.body.textContent?.includes("Your price paid stays private."), false);
      assert.equal(shareToFeedChecked(), false);
      assert.equal(
        win.document.body.textContent?.includes(
          "Cards are private by default. You can show them on your profile.",
        ),
        true,
      );
    } finally {
      again.unmount();
    }

    const other = await mount("bea");
    try {
      assert.equal(radioChecked("Private"), true);
      assert.equal(win.document.body.textContent?.includes(PRIVATE_VISIBILITY_NUDGE), true);
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
});
