import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { NOT_SURE_PARALLEL } from "@/lib/value/match-confidence";

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
const fetched: string[] = [];
expose("fetch", async (url: unknown) => {
  fetched.push(String(url));
  return new win.Response(null, { status: 404 });
});
expose("IS_REACT_ACT_ENVIRONMENT", true);

type Saved = Record<string, unknown>;
type FormProps = { guided?: boolean };
let CardForm: ComponentType<FormProps>;

describe("guided Add card", () => {
  before(async () => {
    ({ CardForm } = await import("@/components/card-form"));
  });

  after(() => {
    win.close();
  });

  it("keeps the photo buttons as the first controls on /cards/new", async () => {
    const view = await mount({ guided: true });
    try {
      await waitFor(() => textIncludes("Who's on the card?"));
      const controls = interactive();
      const take = buttonWithText("Take photo")!;
      const firstIndex = controls.findIndex((el) => el.closest("section")?.textContent?.includes("Take photo"));
      assert.equal(firstIndex, 0, "the photo block comes first");
      const player = win.document.querySelector('input[data-field="playerName"]');
      assert.ok(player);
      assert.ok(take.compareDocumentPosition(player) & win.Node.DOCUMENT_POSITION_FOLLOWING);
      for (const el of controls.slice(0, controls.indexOf(take as HTMLElement))) {
        assert.ok(el.closest("section")?.textContent?.includes("Take photo"), describeEl(el));
      }
      assert.equal(win.document.querySelector("details"), null, "More details waits for Review");
      assert.equal(textIncludes("Mail Day"), false);
    } finally {
      view.unmount();
    }
  });

  it("saves the same columns as the classic form for a base raw card", async () => {
    const guided = await saveGuided(async () => {
      await pickPlayer("wemb", "Victor Wembanyama");
      await clickText("2023-24");
      await clickText("Panini Prizm");
      await typeCardNumber("136");
      await waitFor(() => Boolean(buttonByLabel("Red, numbered to 299")));
      await clickButton(buttonByLabel("Base")!);
      await clickText("Not numbered");
      await clickText("Raw");
    });
    const classic = await saveClassic(async () => {
      await fillClassic({ player: "Victor Wembanyama", year: "2023-24", set: "Panini Prizm", number: "136" });
    });
    assert.deepEqual(guided, classic);
    assert.equal(guided.parallel, "Base");
    assert.equal(guided.serialRun, null);
    assert.equal(guided.grade, "Raw");
    assert.equal(guided.sport, "Basketball");
  });

  it("saves the same columns for a numbered auto graded card", async () => {
    const guided = await saveGuided(async () => {
      await pickPlayer("neto", "Zach Neto");
      await clickText("2024");
      await clickText("Topps Chrome");
      await typeCardNumber("44");
      await waitFor(() => Boolean(buttonByLabel("Gold")));
      await clickButton(buttonByLabel("Auto (signed)")!);
      await clickButton(buttonByLabel("Gold")!);
      await waitFor(() => textIncludes("Is it numbered?"));
      await clickText("/50");
      const yours = win.document.querySelector<HTMLInputElement>('input[aria-label="Your number, out of 50"]');
      assert.ok(yours);
      await act(async () => setNativeValue(yours, "51"));
      await waitFor(() => textIncludes("Your number must be between 1 and 50."));
      await act(async () => setNativeValue(yours, "23"));
      await clickText("Next");
      await clickText("PSA");
      await clickText("10");
    });
    const classic = await saveClassic(async () => {
      await fillClassic({
        player: "Zach Neto",
        year: "2024",
        set: "Topps Chrome",
        number: "44",
        parallel: "Gold",
        serialRun: "50",
        serialNo: "23",
        auto: true,
        sport: "Baseball",
        company: "PSA",
        grade: "10",
      });
    });
    assert.deepEqual(guided, classic);
    assert.equal(guided.serialRun, 50);
    assert.equal(guided.serialNo, 23);
    assert.equal(guided.isAuto, true);
    assert.equal(guided.grade, "PSA 10");
    assert.equal(guided.sport, "Baseball");
  });

  it("saves the same columns for a not-sure parallel", async () => {
    const guided = await saveGuided(async () => {
      await pickPlayer("wemb", "Victor Wembanyama");
      await clickText("2023-24");
      await clickText("Panini Prizm");
      await typeCardNumber("136");
      await waitFor(() => Boolean(buttonByLabel("Base")));
      await clickText("Not sure?");
      await clickText("I'm not sure, save it anyway");
      await clickText("Not numbered");
      await clickText("Raw");
    });
    const classic = await saveClassic(async () => {
      await fillClassic({
        player: "Victor Wembanyama",
        year: "2023-24",
        set: "Panini Prizm",
        number: "136",
        parallel: NOT_SURE_PARALLEL,
      });
    });
    assert.deepEqual(guided, classic);
    assert.equal(guided.parallel, NOT_SURE_PARALLEL);
    assert.equal(guided.parallelIsCustom, true);
    assert.equal(guided.serialRun, null);
  });

  it("skips Numbered? for a checklist parallel and shows the run on Review", async () => {
    const view = await mount({ guided: true });
    try {
      await pickPlayer("wemb", "Victor Wembanyama");
      await clickText("2023-24");
      await clickText("Panini Prizm");
      await typeCardNumber("136");
      await waitFor(() => Boolean(buttonByLabel("Purple, numbered to 99")));
      await clickButton(buttonByLabel("Purple, numbered to 99")!);
      await waitFor(() => textIncludes("Graded or raw?"));
      await clickText("Raw");
      await waitFor(() => textIncludes("Look right?"));
      assert.ok(textIncludes("Numbered to /99 (from the checklist)"));
      assert.ok(textIncludes("2023-24 Panini Prizm · #136 · Purple /99 · Raw"));
      // Back from Review goes to Grade, then Parallel: Numbered? stays skipped.
      await clickButton(buttonByLabel("Back")!);
      assert.ok(textIncludes("Graded or raw?"));
      await clickButton(buttonByLabel("Back")!);
      assert.ok(textIncludes("Which parallel?"));
    } finally {
      view.unmount();
    }
  });

  it("gives every control a name and a 44px target on each step", async () => {
    const view = await mount({ guided: true });
    try {
      const checkStep = (step: string) => {
        for (const el of interactive()) {
          if (el.closest('[role="dialog"]')) continue;
          assert.ok(accessibleName(el), `${step}: ${describeEl(el)} has a name`);
          assert.ok(bigEnough(el), `${step}: ${describeEl(el)} is 44px`);
        }
      };
      await waitFor(() => textIncludes("Who's on the card?"));
      await act(async () => setNativeValue(playerInput(), "wemb"));
      await waitFor(() => Boolean(buttonWithText("Victor Wembanyama")));
      checkStep("player");
      await clickButton(buttonWithText("Victor Wembanyama")!);
      await waitFor(() => textIncludes("What year is it?"));
      await clickText("Not sure?");
      checkStep("year");
      await clickText("2023-24");
      await waitFor(() => textIncludes("Which set?"));
      await clickText("Not sure?");
      checkStep("set");
      await clickText("Panini Prizm");
      checkStep("number");
      await typeCardNumber("136");
      await waitFor(() => Boolean(buttonByLabel("Red, numbered to 299")));
      await clickText("Not sure?");
      checkStep("parallel");
      await clickButton(buttonByLabel("Base")!);
      await clickText("/25");
      await clickText("Other");
      checkStep("serial");
      await clickText("Not numbered");
      await clickText("PSA");
      checkStep("grade");
      await clickText("Raw");
      await waitFor(() => textIncludes("Look right?"));
      win.document.querySelector("details")!.open = true;
      for (const el of interactive()) {
        if (el.closest("details")) continue; // CardForm's own More details fields
        assert.ok(accessibleName(el), `review: ${describeEl(el)} has a name`);
      }
    } finally {
      view.unmount();
    }
  });

  it("uses one catalog lookup per picked player and no comps fetch", async () => {
    fetched.length = 0;
    const view = await mount({ guided: true });
    try {
      await act(async () => setNativeValue(playerInput(), "w"));
      await act(async () => setNativeValue(playerInput(), "we"));
      await act(async () => setNativeValue(playerInput(), "wemb"));
      await waitFor(() => Boolean(buttonWithText("Victor Wembanyama")));
      await clickButton(buttonWithText("Victor Wembanyama")!);
      await waitFor(() => textIncludes("Their cards"));
      assert.ok(buttonWithText("2023-24"));
      assert.equal(fetched.filter((url) => url.includes("/api/comps")).length, 0);
    } finally {
      view.unmount();
    }
  });

  it("jumps from Year 'Not sure' to Parallel with a catalog card", async () => {
    const view = await mount({ guided: true });
    try {
      await pickPlayer("wemb", "Victor Wembanyama");
      await clickText("Not sure?");
      await waitFor(() => textIncludes("Or pick one of their cards"));
      const tile = [...win.document.querySelectorAll("button")].find(
        (el) => el.textContent?.includes("Hoops") && el.textContent.includes("#277"),
      );
      assert.ok(tile);
      await clickButton(tile);
      await waitFor(() => textIncludes("Which parallel?"));
      assert.ok(textIncludes("2023-24 · Hoops · #277"));
    } finally {
      view.unmount();
    }
  });
});

describe("motion", () => {
  it("slides only with motion allowed and fades under reduced motion", () => {
    const flow = read("components/add-card/add-card-flow.tsx");
    assert.match(flow, /motion-safe:animate-\[add-step-in/);
    assert.match(flow, /motion-safe:animate-\[add-step-back/);
    assert.match(flow, /motion-reduce:animate-\[add-fade/);
    assert.doesNotMatch(flow, /motion-reduce:animate-\[add-step/);
    const css = read("app/globals.css");
    const fade = css.slice(css.indexOf("@keyframes add-fade"), css.indexOf("@keyframes slab-reveal"));
    assert.doesNotMatch(fade, /transform/);
    const panel = read("components/card-added-panel.tsx");
    for (const match of panel.matchAll(/animate-\[(slab-reveal|reveal-glow)/g)) {
      const before = panel.slice(Math.max(0, (match.index ?? 0) - 12), match.index);
      assert.match(before, /motion-safe:$/);
    }
  });
});

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

async function saveGuided(walk: () => Promise<void>): Promise<Saved> {
  const capture: Saved[] = [];
  const view = await mount({ guided: true }, capture);
  try {
    await walk();
    await waitFor(() => textIncludes("Look right?"));
    await clickButton(buttonWithText("Add to collection")!);
    await waitFor(() => capture.length === 1);
    return capture[0];
  } finally {
    view.unmount();
  }
}

async function saveClassic(fill: () => Promise<void>): Promise<Saved> {
  const capture: Saved[] = [];
  const view = await mount({}, capture);
  try {
    await waitFor(() => textIncludes("Add a card"));
    await fill();
    await clickButton(buttonWithText("Add to collection")!);
    await waitFor(() => capture.length === 1);
    return capture[0];
  } finally {
    view.unmount();
  }
}

async function fillClassic(input: {
  player: string;
  year: string;
  set: string;
  number: string;
  parallel?: string;
  serialRun?: string;
  serialNo?: string;
  auto?: boolean;
  sport?: string;
  company?: string;
  grade?: string;
}) {
  await act(async () => setNativeValue(field("playerName"), input.player));
  await chooseSearch(field("yearLabel"), input.year);
  await chooseSearch(field("setBrand"), input.set);
  await act(async () => setNativeValue(field("cardNumber"), input.number));
  if (input.parallel) await chooseSearch(buttonByLabel("Parallel")!, input.parallel);
  if (input.sport) {
    await act(async () => setNativeValue(selectByLabel("Sport"), input.sport!));
  }
  if (input.serialRun) {
    await act(async () => setNativeValue(inputByLabel("Serial run"), input.serialRun!));
  }
  if (input.serialNo) {
    const serialNo = win.document.querySelector<HTMLInputElement>('input[placeholder="e.g. 7"]')!;
    await act(async () => setNativeValue(serialNo, input.serialNo!));
  }
  if (input.auto) {
    const auto = [...win.document.querySelectorAll("label")].find((el) => el.textContent?.trim() === "Auto");
    await act(async () => auto!.querySelector("input")!.click());
  }
  if (input.company) {
    await act(async () => setNativeValue(field("gradingCompany"), input.company!));
  }
  if (input.grade) {
    await act(async () => setNativeValue(field("grade"), input.grade!));
  }
}

async function pickPlayer(query: string, name: string) {
  await waitFor(() => textIncludes("Who's on the card?"));
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
  await waitFor(() => textIncludes("Which parallel?"));
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

function inputByLabel(label: string): HTMLInputElement {
  const el = win.document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  assert.ok(el, label);
  return el;
}

function selectByLabel(label: string): HTMLSelectElement {
  const el = win.document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  assert.ok(el, label);
  return el;
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

function field(name: string): HTMLElement {
  const el = win.document.querySelector(`[data-field="${name}"]`);
  assert.ok(el instanceof win.HTMLElement, name);
  return el;
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

async function chooseSearch(trigger: HTMLElement, text: string) {
  await act(async () => {
    trigger.click();
  });
  const input = win.document.querySelector('[role="dialog"] input');
  assert.ok(input instanceof win.HTMLInputElement);
  await act(async () => {
    setNativeValue(input, text);
    fire(input, new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
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

function Harness({ children, capture }: { children: ReactNode; capture: Saved[] }) {
  const social = {
    ready: true,
    mode: "local" as const,
    user: null,
    createPost: async () => ({ error: null, postId: null }),
  };
  const collection = {
    ready: true,
    cards: [],
    syncError: null,
    getCard: () => undefined,
    addCard: (input: Saved) => {
      capture.push(input);
      return {
        card: { ...input, id: "new-card", createdAt: "2026-10-28T00:00:00Z", updatedAt: "2026-10-28T00:00:00Z" },
        saved: Promise.resolve(),
      };
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
      { value: social as never },
      createElement(CollectionContext.Provider, { value: collection as never }, children),
    ),
  );
}

async function mount(props: FormProps, capture: Saved[] = []) {
  win.localStorage.clear();
  const { clearNewCardDraft } = await import("@/lib/cards/new-card-draft");
  clearNewCardDraft();
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness, { capture }, createElement(CardForm, props)));
  });
  return {
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}
