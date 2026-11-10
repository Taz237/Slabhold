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
const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push(href: string) {
    pushed.push(href);
  },
  replace() {},
  prefetch() {},
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

type Saved = Record<string, unknown>;
type FormProps = {
  guided?: boolean;
  initialSport?: string;
  initialPrefill?: { player: string; year: string; set: string } | null;
};
type Social = {
  user: { id: string; username: string } | null;
  postError: string | null;
  posts: Saved[];
};
let CardForm: ComponentType<FormProps>;

describe("Add card v2", () => {
  before(async () => {
    ({ CardForm } = await import("@/components/card-form"));
  });

  after(() => {
    win.close();
  });

  it("typing 'downtown' shows Downtown under Inserts before a set is picked", async () => {
    const view = await mount({ guided: true });
    try {
      await waitFor(() => textIncludes("What's on the card?"));
      const input = playerInput();
      assert.equal(input.placeholder, "Try Malik Nabers Kaboom or Tyrese Maxey Downtown");
      await act(async () => setNativeValue(input, "downtown"));
      await waitFor(() => Boolean(buttonByLabel("Downtown insert")));
      assert.ok(textIncludes("Inserts"));
      assert.ok(buttonWithText("Or add step by step"));
      await act(async () => setNativeValue(playerInput(), "Tyrese Maxey Downtown"));
      await waitFor(() => Boolean(buttonByLabel("Tyrese Maxey, Downtown")));
      for (const el of interactive()) {
        assert.ok(accessibleName(el), `door: ${describeEl(el)} has a name`);
        assert.ok(bigEnough(el), `door: ${describeEl(el)} is 44px`);
      }
    } finally {
      view.unmount();
    }
  });

  it("'Malik Nabers Kaboom' fills the player and the insert in one pick, then Kaboom sets lead", async () => {
    const view = await mount({ guided: true });
    try {
      await waitFor(() => textIncludes("What's on the card?"));
      await act(async () => setNativeValue(playerInput(), "Malik Nabers Kaboom"));
      await waitFor(() => Boolean(buttonByLabel("Malik Nabers, Kaboom")));
      await clickButton(buttonByLabel("Malik Nabers, Kaboom")!);
      await waitFor(() => textIncludes("What year is it?"));
      const preview = win.document.querySelector('[aria-label="Card preview"]')?.textContent ?? "";
      assert.match(preview, /Malik Nabers/);
      assert.match(preview, /Kaboom/);
      await clickText("2024");
      await waitFor(() => textIncludes("Which set?"));
      const sets = [...win.document.querySelectorAll("ul button")].map((el) => el.textContent ?? "");
      assert.match(sets[0] ?? "", /Panini Donruss/);
      assert.match(sets[1] ?? "", /Donruss Optic/);
      assert.match(sets[2] ?? "", /Panini Absolute/);
    } finally {
      view.unmount();
    }
  });

  it("step by step still reaches Parallel or insert, with Downtown on Donruss Optic and search always there", async () => {
    const view = await mount({ guided: true });
    try {
      await waitFor(() => textIncludes("What's on the card?"));
      await clickText("Or add step by step");
      await waitFor(() => textIncludes("Who's on the card?"));
      await pickPlayerStep("maxey", "Tyrese Maxey");
      await clickText("2024-25");
      await waitFor(() => textIncludes("Which set?"));
      await clickText("Donruss Optic");
      await typeCardNumber("7");
      assert.ok(buttonByLabel("Downtown"), "Downtown chip without typing");
      assert.ok(buttonByLabel("Kaboom"));
      assert.ok(textIncludes("Don't see it? Type it as it reads on the card."));
      assert.ok(win.document.querySelector('input[placeholder^="Search"]'), "search is always shown");
    } finally {
      view.unmount();
    }
  });

  it("a typed Kaboom on a set without it saves as a custom parallel", async () => {
    const capture: Saved[] = [];
    const view = await mount({ guided: true }, capture);
    try {
      await pickPlayer("wemb", "Victor Wembanyama");
      await clickText("2023-24");
      await clickText("Hoops");
      await typeCardNumber("1");
      const search = win.document.querySelector<HTMLInputElement>('input[placeholder^="Search"]')!;
      await act(async () => setNativeValue(search, "Mystery Wave"));
      await clickText('Use \u201cMystery Wave\u201d');
      await waitFor(() => textIncludes("Is it numbered?"));
      await clickText("Not numbered");
      await clickText("Raw");
      await waitFor(() => textIncludes("Look right?"));
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => capture.length === 1);
      assert.equal(capture[0].parallel, "Mystery Wave");
      assert.equal(capture[0].parallelIsCustom, true);
    } finally {
      view.unmount();
    }
  });

  it("Add another opens on Card # with player, year and set filled", async () => {
    const view = await mount({
      guided: true,
      initialSport: "Basketball",
      initialPrefill: { player: "Tyrese Maxey", year: "2024-25", set: "Donruss Optic" },
    });
    try {
      await waitFor(() => textIncludes("What's the card number?"));
      const preview = win.document.querySelector('[aria-label="Card preview"]')?.textContent ?? "";
      assert.match(preview, /Tyrese Maxey/);
      assert.match(preview, /2024-25 · Donruss Optic/);
      await clickText("Start a different card");
      await waitFor(() => textIncludes("What's on the card?"));
      assert.equal(playerInput().value, "");
    } finally {
      view.unmount();
    }
  });

  it("Review: the post toggle is off while private, on once public, and posts the caption", async () => {
    const social: Social = { user: { id: "user-1", username: "fixturecollector" }, postError: null, posts: [] };
    const capture: Saved[] = [];
    const view = await mount({ guided: true }, capture, social);
    try {
      await walkToReview();
      const toggle = checkboxByLabel("Also post to my feed");
      assert.equal(toggle.checked, false);
      assert.equal(toggle.disabled, true);
      assert.ok(textIncludes("Private cards stay off the feed."));
      await clickText("Public");
      await waitFor(() => checkboxByLabel("Also post to my feed").checked);
      const caption = win.document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Post caption"]')!;
      assert.equal(caption.value, "Just added my 2023-24 Panini Prizm Victor Wembanyama");
      await act(async () => setNativeValue(caption, "New Wemby!"));
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => social.posts.length === 1);
      assert.equal(social.posts[0].body, "New Wemby!");
      assert.equal(social.posts[0].shareOfNewCard, true);
      assert.equal(social.posts[0].imageDataUrl, null);
      assert.equal(capture.length, 1);
      await waitFor(() => pushed.at(-1) === "/cards/new-card?added=1");
      // A second submit after a recorded post never posts again.
      await submitForm();
      assert.equal(social.posts.length, 1);
    } finally {
      view.unmount();
    }
  });

  it("a failed post still keeps the card, goes to the reveal, and a retry adds no second card", async () => {
    const social: Social = { user: { id: "user-1", username: "fixturecollector" }, postError: "feed down", posts: [] };
    const capture: Saved[] = [];
    const view = await mount({ guided: true }, capture, social);
    try {
      pushed.length = 0;
      await walkToReview();
      await clickText("Public");
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => pushed.includes("/cards/new-card?added=1"));
      assert.equal(capture.length, 1);
      assert.match(win.sessionStorage.getItem("slabhold.card-post-failed") ?? "", /new-card/);
      assert.equal(textIncludes("couldn't share it to the feed"), false);
      await submitForm();
      assert.equal(capture.length, 1, "retry updates the same card");
    } finally {
      view.unmount();
    }
  });

  it("brand, official and test accounts: the toggle stays off and Add card never posts", async () => {
    const social: Social = { user: { id: "user-2", username: "qa_fixture_test" }, postError: null, posts: [] };
    const { isTestAccount } = await import("@/lib/test-accounts");
    assert.equal(isTestAccount("qa_fixture_test"), true, "fixture handle is a test account");
    const view = await mount({ guided: true }, [], social);
    try {
      await walkToReview();
      await clickText("Public");
      const toggle = checkboxByLabel("Also post to my feed");
      assert.equal(toggle.checked, false);
      assert.equal(toggle.disabled, true);
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => pushed.at(-1) === "/cards/new-card?added=1");
      assert.equal(social.posts.length, 0);
    } finally {
      view.unmount();
    }
  });
});

async function submitForm() {
  const form = win.document.querySelector("form")!;
  await act(async () => {
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
}

async function walkToReview() {
  await pickPlayer("wemb", "Victor Wembanyama");
  await clickText("2023-24");
  await clickText("Panini Prizm");
  await typeCardNumber("136");
  await waitFor(() => Boolean(buttonByLabel("Base")));
  await clickButton(buttonByLabel("Base")!);
  await clickText("Not numbered");
  await clickText("Raw");
  await waitFor(() => textIncludes("Look right?"));
}

async function pickPlayerStep(query: string, name: string) {
  await act(async () => setNativeValue(playerInput(), query));
  await waitFor(() => Boolean(buttonWithText(name)));
  await clickButton(buttonWithText(name)!);
  await waitFor(() => textIncludes("What year is it?"));
}

function checkboxByLabel(text: string): HTMLInputElement {
  const label = [...win.document.querySelectorAll("label")].find((el) => el.textContent?.includes(text));
  const input = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  assert.ok(input, text);
  return input;
}

async function pickPlayer(query: string, name: string) {
  await waitFor(() => textIncludes("What's on the card?"));
  await act(async () => setNativeValue(playerInput(), query));
  await waitFor(() => Boolean(buttonWithText(name)));
  await clickButton(buttonWithText(name)!);
  await waitFor(() => textIncludes("What year is it?"));
}

async function typeCardNumber(value: string) {
  await waitFor(() => textIncludes("What's the card number?"));
  const input = win.document.querySelector<HTMLInputElement>('input[data-field="cardNumber"]')!;
  await act(async () => setNativeValue(input, value));
  await clickText("Next");
  await waitFor(() => textIncludes("Which parallel or insert?"));
}

function playerInput(): HTMLInputElement {
  const el = win.document.querySelector<HTMLInputElement>('input[data-field="playerName"]');
  assert.ok(el);
  return el;
}

function interactive(): HTMLElement[] {
  return [
    ...win.document.querySelectorAll<HTMLElement>(
      "button, a[href], input:not([type=file]), select, textarea, summary",
    ),
  ];
}

function describeEl(el: Element) {
  return `<${el.tagName.toLowerCase()} ${el.getAttribute("aria-label") ?? ""}> ${el.textContent?.trim().slice(0, 40) ?? ""}`;
}

function accessibleName(el: HTMLElement): string {
  const label = el.getAttribute("aria-label");
  if (label?.trim()) return label;
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) return win.document.getElementById(labelledBy)?.textContent ?? "";
  const wrap = el.closest("label");
  if (wrap?.textContent?.trim()) return wrap.textContent;
  if (el instanceof win.HTMLInputElement && el.id) {
    const forLabel = win.document.querySelector(`label[for="${el.id}"]`);
    if (forLabel?.textContent?.trim()) return forLabel.textContent;
  }
  return el.textContent?.trim() ?? "";
}

/** Tailwind classes that give 44px or more, on the element or a wrapping hit area. */
function bigEnough(el: HTMLElement): boolean {
  const big = /(?:^|\s)(?:min-h-1[1-9]|min-h-\[(?:[5-9]\d|1\d\d)px\]|min-h-16|min-h-20|h-1[1-9]|h-14|size-1[1-9]|min-h-12)(?:\s|$)/;
  if (big.test(el.className)) return true;
  // The photo tile fills a 112px-wide 5:7 box.
  if (/h-full w-full/.test(el.className) && el.parentElement?.style.aspectRatio) return true;
  if (el instanceof win.HTMLInputElement && el.type === "checkbox") {
    return big.test(el.parentElement?.className ?? "");
  }
  return false;
}

function textIncludes(value: string): boolean {
  return win.document.body.textContent?.includes(value) === true;
}

function buttonWithText(label: string): HTMLButtonElement | undefined {
  return [...win.document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) ??
    [...win.document.querySelectorAll("button")].find((node) => node.textContent?.includes(label));
}

function buttonByLabel(label: string): HTMLButtonElement | null {
  if (label === "Base") {
    // The big Base button has a subtitle under its name.
    return (
      [...win.document.querySelectorAll("button")].find((node) =>
        node.textContent?.startsWith("BaseNo color"),
      ) ?? null
    );
  }
  return win.document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ??
    [...win.document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) ??
    null;
}



async function clickText(label: string) {
  const exact = [...win.document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label);
  const el = exact ?? buttonWithText(label);
  assert.ok(el, `button ${label}`);
  await clickButton(el);
}

async function clickButton(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await settle();
}


function fire(el: object, event: object) {
  (el as { dispatchEvent(ev: object): void }).dispatchEvent(event);
}

function setNativeValue(el: object, value: string) {
  const proto =
    el instanceof win.HTMLTextAreaElement
      ? win.HTMLTextAreaElement.prototype
      : el instanceof win.HTMLSelectElement
        ? win.HTMLSelectElement.prototype
        : win.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  fire(el, new win.Event("input", { bubbles: true }));
  fire(el, new win.Event("change", { bubbles: true }));
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

function Harness({ children, capture, social }: { children?: ReactNode; capture: Saved[]; social: Social }) {
  const value = {
    ready: true,
    mode: "supabase" as const,
    user: social.user,
    createPost: async (draft: Saved) => {
      if (social.postError) return { error: social.postError, postId: null };
      social.posts.push(draft);
      return { error: null, postId: `post-${social.posts.length}` };
    },
  };
  let stored: Saved[] = [];
  const collection = {
    ready: true,
    loaded: true,
    cards: stored,
    syncError: null,
    getCard: () => undefined,
    addCard: (input: Saved) => {
      capture.push(input);
      const card = { ...input, id: (input.id as string) ?? "new-card", createdAt: "2026-11-10T00:00:00Z", updatedAt: "2026-11-10T00:00:00Z" };
      stored = [card];
      collection.cards = stored;
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

async function mount(
  props: FormProps,
  capture: Saved[] = [],
  social: Social = { user: null, postError: null, posts: [] },
) {
  win.localStorage.clear();
  win.sessionStorage.clear();
  const { clearNewCardDraft } = await import("@/lib/cards/new-card-draft");
  const { clearFlowPosition } = await import("@/lib/cards/add-flow");
  const { clearDoorQuery } = await import("@/lib/cards/add-door");
  clearNewCardDraft();
  clearFlowPosition();
  clearDoorQuery();
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness, { capture, social }, createElement(CardForm, props)));
  });
  return {
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}
