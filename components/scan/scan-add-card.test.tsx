import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as {
  AppRouterContext: {
    Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode;
  };
};

const pushed: string[] = [];
const prefetched: string[] = [];
const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push(href: string) {
    pushed.push(href);
  },
  replace() {},
  prefetch(href: string) {
    prefetched.push(href);
  },
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000/cards/new",
  pretendToBeVisual: true,
});
const win = dom.window;
Object.defineProperty(win, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }),
});

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

type Saved = Record<string, unknown>;
type Social = { user: { id: string; username: string } | null };

let ScanAddCard: ComponentType<{ scanId: string }>;
let capture: typeof import("@/lib/capture");
let handoff: typeof import("@/lib/scan/handoff");

before(async () => {
  ({ ScanAddCard } = await import("@/components/scan/scan-add-card"));
  capture = await import("@/lib/capture");
  handoff = await import("@/lib/scan/handoff");
});

after(() => {
  win.close();
});

/** Made-up scans. The cert is not a real one. */
const SLAB = {
  catalogId: null,
  playerName: "Victor Wembanyama",
  sport: "Basketball",
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  cardNumber: "136",
  parallel: "Silver",
  serialRun: null,
  serialNo: "",
  isRookie: true,
  isAuto: false,
  grade: { company: "PSA", number: "10", qualifier: "", certNumber: "45678912", authentic: false, autoGrade: "" },
  score: 120,
  sureness: { player: "sure", year: "sure", set: "sure", number: "sure", parallel: "sure" },
  parallelOptions: [],
} as const;

/** A 1x1 PNG, standing in for the scan photo. */
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const RAW_OPEN_PARALLEL = {
  ...SLAB,
  parallel: "",
  grade: null,
  sureness: { player: "sure", year: "sure", set: "likely", number: "sure", parallel: "unsure" },
} as const;

describe("Add card from a scan", () => {
  it("opens a fully read slab on Review and saves its grade and cert", async () => {
    const saved: Saved[] = [];
    const view = await mountScan(SLAB, "scanslab0001", saved);
    try {
      await waitFor(() => textIncludes("Look right?"));
      assert.ok(textIncludes("Victor Wembanyama"));
      assert.ok(textIncludes("Silver"));
      assert.ok(textIncludes("Start a different card"));
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => saved.length === 1);
      assert.equal(saved[0].playerName, "Victor Wembanyama");
      assert.equal(saved[0].cardNumber, "136");
      assert.equal(saved[0].parallel, "Silver");
      assert.equal(saved[0].grade, "PSA 10");
      assert.equal(saved[0].certNumber, "45678912");
      assert.equal(saved[0].isRookie, true);
      assert.equal(win.sessionStorage.getItem("cardflip.scan-match"), null, "the cert is cleared after save");
      assert.equal(win.location.href.includes("45678912"), false);
    } finally {
      view.unmount();
    }
  });

  it("saves on its own after Yes, add it, with the grade and cert", async () => {
    const saved: Saved[] = [];
    const view = await mountScan(SLAB, "scanauto0001", saved, "scanauto0001", { autoSave: true }, false, PHOTO);
    try {
      await waitFor(() => saved.length === 1);
      assert.equal(saved[0].photoDataUrl, PHOTO, "the scan photo saves with it");
      assert.equal(saved[0].grade, "PSA 10");
      assert.equal(saved[0].certNumber, "45678912");
      assert.equal(saved[0].isPublic, false, "private unless the collector chose public before");
      await settle();
      assert.equal(saved.length, 1, "saves once");
      assert.equal(win.sessionStorage.getItem("cardflip.scan-match"), null);
      // The owners line is gone from the Added screen, so a scan save leaves no marker for it.
      assert.equal(win.sessionStorage.getItem("cardflip.scan-added"), null);
    } finally {
      view.unmount();
    }
  });

  it("uses the collector's last visibility choice for a one-tap add", async () => {
    const saved: Saved[] = [];
    const view = await mountScan(SLAB, "scanauto0002", saved, "scanauto0002", { autoSave: true }, true);
    try {
      await waitFor(() => saved.length === 1);
      assert.equal(saved[0].isPublic, true);
    } finally {
      view.unmount();
    }
  });

  it("opens on the parallel when the scan couldn't tell it", async () => {
    const view = await mountScan(RAW_OPEN_PARALLEL, "scanraw00001");
    try {
      await waitFor(() => textIncludes("Which parallel or insert?"));
    } finally {
      view.unmount();
    }
  });

  it("opens the usual Add card when the handoff is missing", async () => {
    const view = await mountScan(null, "scanmissing1");
    try {
      await waitFor(() => textIncludes("What's on the card?"));
      assert.equal(win.sessionStorage.getItem("cardflip.scan-added"), null);
    } finally {
      view.unmount();
    }
  });

  it("does not apply a handoff saved for a different scan", async () => {
    const view = await mountScan(SLAB, "scanother001", [], "scanother002");
    try {
      await waitFor(() => textIncludes("What's on the card?"));
      assert.equal(textIncludes("Victor Wembanyama"), false);
    } finally {
      view.unmount();
    }
  });
});

function textIncludes(value: string): boolean {
  return win.document.body.textContent?.includes(value) === true;
}

function buttonWithText(label: string): HTMLButtonElement | undefined {
  return [...win.document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) ??
    [...win.document.querySelectorAll("button")].find((node) => node.textContent?.includes(label));
}



async function clickButton(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await settle();
}


async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

async function waitFor(check: () => boolean, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(win.document.body.textContent?.slice(0, 800) ?? "timed out");
}

function Harness({ children, saved, social }: { children?: ReactNode; saved: Saved[]; social: Social }) {
  const value = {
    ready: true,
    mode: social.user ? ("supabase" as const) : ("local" as const),
    user: social.user,
    createPost: async () => ({ error: null, postId: null }),
  };
  const collection = {
    ready: true,
    loaded: true,
    cards: [] as Saved[],
    syncError: null,
    getCard: () => undefined,
    addCard: (input: Saved) => {
      saved.push(input);
      const card = { ...input, id: "new-card", createdAt: "2026-11-10T00:00:00Z", updatedAt: "2026-11-10T00:00:00Z" };
      collection.cards = [card];
      return { card, saved: Promise.resolve() };
    },
    updateCard: (id: string, patch: Saved) => ({ card: { ...patch, id }, saved: Promise.resolve() }),
    removeCard() {},
    reload() {},
  };
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      SocialContext.Provider,
      { value: value as never },
      createElement(CollectionContext.Provider, { value: collection as never }, children),
    ),
  );
}

async function mountScan(
  match: Record<string, unknown> | null,
  savedId: string,
  saved: Saved[] = [],
  openId: string = savedId,
  options: { autoSave?: boolean } = {},
  rememberPublic = false,
  photo: string | null = null,
) {
  win.localStorage.clear();
  win.sessionStorage.clear();
  capture.clearScanMatch();
  const { clearNewCardDraft } = await import("@/lib/cards/new-card-draft");
  const { clearFlowPosition } = await import("@/lib/cards/add-flow");
  const { clearDoorQuery } = await import("@/lib/cards/add-door");
  clearNewCardDraft();
  clearFlowPosition();
  clearDoorQuery();
  if (match) {
    const stored = handoff.scanHandoffFrom(match as never, savedId, options);
    // As after a reload: only sessionStorage has it.
    win.sessionStorage.setItem("cardflip.scan-match", JSON.stringify(stored));
    if (photo) win.sessionStorage.setItem("cardflip.scan", photo);
  }
  const social: Social = rememberPublic ? { user: { id: "user-1", username: "fixturecollector" } } : { user: null };
  if (rememberPublic) {
    const { writeBrowserVisibilityChoice } = await import("@/lib/cards/visibility-choice");
    writeBrowserVisibilityChoice("user-1", true);
  }
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness, { saved, social }, createElement(ScanAddCard, { scanId: openId })));
  });
  return {
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}
