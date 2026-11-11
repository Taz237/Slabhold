import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { createElement, act, useMemo, type ComponentType, type ReactNode } from "react";
import { CollectionContext, CollectionProvider } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { STORAGE_KEY } from "@/lib/storage";
import type { SportsCard } from "@/lib/types";
import { dateRowValue, moneyRowValue, serialRowValue } from "@/components/edit-card/edit-parts";

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as {
  AppRouterContext: {
    Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode;
  };
};
const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

const pushed: string[] = [];
router.push = ((href: string) => void pushed.push(href)) as () => void;

/** A fixture card, graded and numbered, with a paid price and a purchase date. */
const card: SportsCard = {
  id: "fixture-edit",
  playerName: "Fixture Player",
  year: 2023,
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  setIsCustom: false,
  cardNumber: "136",
  noNumber: false,
  grade: "PSA 9",
  parallel: "Silver",
  parallelIsCustom: false,
  serialRun: 99,
  serialNo: 7,
  isRookie: false,
  isAuto: false,
  isRelic: false,
  conditionType: "graded",
  gradeQualifier: "",
  certNumber: "",
  sport: "Basketball",
  purchasePrice: 120,
  purchaseDate: "2025-03-14",
  estimatedSellPrice: 0,
  sellPrice: null,
  sellDate: null,
  notes: "",
  photoDataUrl: null,
  accent: "#7c5cff",
  category: "pc",
  isPublic: false,
  openToOffers: false,
  createdAt: "2025-03-14T00:00:00.000Z",
  updatedAt: "2025-03-14T00:00:00.000Z",
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
expose("KeyboardEvent", win.KeyboardEvent);

type CardFormProps = { existing?: SportsCard };
let CardForm: ComponentType<CardFormProps>;

before(async () => {
  ({ CardForm } = await import("@/components/card-form"));
});

after(() => {
  win.close();
});

describe("Edit card rows", () => {
  it("formats row values: money, a calendar date that never shifts, and the serial as 7 / 99", () => {
    assert.equal(moneyRowValue("1250"), "$1,250.00");
    assert.equal(moneyRowValue(""), "");
    assert.equal(dateRowValue("2025-03-14"), "Mar 14, 2025");
    assert.equal(serialRowValue("7", "99"), "7 / 99");
    assert.equal(serialRowValue("", "99"), "/ 99");
    assert.equal(serialRowValue("", ""), "");
  });

  it("opens on the slab with player, year, set and grade under it, and no form boxes", async () => {
    const view = await mountEdit();
    try {
      const form = editForm();
      assert.ok(form.querySelector("[data-slab-frame], [aria-hidden]"), "the slab art is drawn");
      assert.ok(textIncludes("Fixture Player"));
      assert.ok(textIncludes("2023-24 · Panini Prizm · PSA 9"));
      // Nothing above the first group is a text field.
      const firstGroup = form.querySelector("section");
      assert.ok(firstGroup);
      const fields = [...form.querySelectorAll("input, textarea, select")].filter(
        (el) => firstGroup.compareDocumentPosition(el) & win.Node.DOCUMENT_POSITION_PRECEDING,
      );
      assert.deepEqual(fields, []);
    } finally {
      view.unmount();
    }
  });

  it("groups Card, Details, Your money, Sold and Sharing as rows with values on the right", async () => {
    const view = await mountEdit();
    try {
      const titles = [...editForm().querySelectorAll("section h2")].map((el) => el.textContent);
      assert.deepEqual(titles, ["Card", "Details", "Your money", "Sold", "Sharing"]);
      assert.ok(rowLabel("Player").includes("Fixture Player"));
      assert.ok(rowLabel("Year").includes("2023-24"));
      assert.ok(rowLabel("Set").includes("Panini Prizm"));
      assert.ok(rowLabel("Card #").includes("#136"));
      assert.ok(rowLabel("Parallel").includes("Silver"));
      assert.ok(rowLabel("Serial").includes("7 / 99"));
      assert.ok(rowLabel("Grading").includes("PSA"));
      assert.ok(rowLabel("Grade").includes("9"));
      assert.ok(rowLabel("What you paid").includes("$120.00"));
      assert.ok(rowLabel("Purchase date").includes("Mar 14, 2025"));
      assert.ok(rowLabel("Mark as sold"));
      // Current value is read-only: a row, not a button.
      assert.ok(textIncludes("Current value"));
      assert.equal(findRow("Current value"), undefined);
      // Rookie, Auto and Patch / Relic are pill chips in one row, not checkboxes.
      assert.equal(editForm().querySelectorAll('input[type="checkbox"]').length, 0);
      for (const label of ["Rookie", "Auto", "Patch / Relic"]) {
        assert.equal(chip(label).getAttribute("aria-pressed"), "false");
      }
    } finally {
      view.unmount();
    }
  });

  it("hides empty optional rows (cert #, notes) under one More details row", async () => {
    const view = await mountEdit();
    try {
      assert.equal(findRow("Cert #"), undefined);
      assert.equal(findRow("Notes"), undefined);
      assert.equal(findRow("Qualifier"), undefined);
      await click(findRow("More details")!);
      assert.ok(findRow("Cert #"));
      assert.ok(findRow("Notes"));
      assert.ok(findRow("Qualifier"));
      assert.equal(findRow("More details"), undefined);
    } finally {
      view.unmount();
    }
  });

  it("keeps Save disabled until something changes, then saves every field as before", async () => {
    const view = await mountEdit();
    try {
      const save = saveButton();
      assert.equal(save.disabled, true, "nothing changed yet");
      await click(chip("Rookie"));
      assert.equal(chip("Rookie").getAttribute("aria-pressed"), "true");
      assert.equal(saveButton().disabled, false);
      await click(chip("Rookie"));
      assert.equal(saveButton().disabled, true, "back to how it was");
      await click(chip("Auto"));
      await act(async () => {
        saveButton().click();
        fire(editForm(), new win.Event("submit", { bubbles: true, cancelable: true }));
      });
      await waitFor(() => stored()?.isAuto === true);
      const saved = stored()!;
      assert.equal(saved.playerName, "Fixture Player");
      assert.equal(saved.yearLabel, "2023-24");
      assert.equal(saved.cardNumber, "136");
      assert.equal(saved.parallel, "Silver");
      assert.equal(saved.serialRun, 99);
      assert.equal(saved.serialNo, 7);
      assert.equal(saved.grade, "PSA 9");
      assert.equal(saved.purchasePrice, 120);
      assert.equal(saved.purchaseDate, "2025-03-14");
      assert.equal(saved.isPublic, false);
      assert.equal(saved.category, "pc");
      await waitFor(() => pushed.includes("/cards/fixture-edit"));
    } finally {
      view.unmount();
    }
  });

  it("puts Delete card as a quiet red row at the very bottom, under every group", async () => {
    const view = await mountEdit();
    try {
      const del = [...editForm().querySelectorAll("button")].find((el) => el.textContent?.trim() === "Delete card");
      assert.ok(del);
      assert.match(del.className, /text-rose-600/);
      assert.doesNotMatch(del.className, /(^|\s)bg-rose/, "text only, no filled button");
      for (const section of editForm().querySelectorAll("section")) {
        assert.ok(section.compareDocumentPosition(del) & win.Node.DOCUMENT_POSITION_FOLLOWING);
      }
      assert.ok(del.compareDocumentPosition(saveButton()) & win.Node.DOCUMENT_POSITION_FOLLOWING, "Save pinned last");
    } finally {
      view.unmount();
    }
  });
});

describe("Edit card pickers open on their choices, never the keyboard", () => {
  for (const [label, choice] of [
    ["Player", "Fixture Player"],
    ["Year", "2023-24"],
    ["Set", "Panini Prizm"],
    ["Parallel", "Silver"],
    ["Grading", "PSA"],
    ["Grade", "9"],
    ["Sport", "Basketball"],
  ] as const) {
    it(`${label}: the list shows and nothing is focused`, async () => {
      const view = await mountEdit();
      try {
        await click(findRow(label)!);
        await flushFrames();
        const dialog = sheet();
        const options = [...dialog.querySelectorAll("ul button")].map((el) => el.textContent?.trim());
        assert.ok(options.includes(choice), `${label} lists ${choice}`);
        assert.ok(keyboardDown(), `${label} does not focus a field`);
      } finally {
        view.unmount();
      }
    });
  }

  it("Qualifier: the list shows and nothing is focused", async () => {
    const view = await mountEdit();
    try {
      await click(findRow("More details")!);
      await click(findRow("Qualifier")!);
      await flushFrames();
      assert.ok(sheet().querySelectorAll("ul button").length > 1);
      assert.ok(keyboardDown());
    } finally {
      view.unmount();
    }
  });

  it("short lists (grading, grade, sport) have no search field at all", async () => {
    const view = await mountEdit();
    try {
      for (const label of ["Grading", "Grade", "Sport"]) {
        await click(findRow(label)!);
        assert.equal(sheet().querySelector("input"), null, label);
        await click(sheet().querySelector<HTMLButtonElement>('button[aria-label="Close"]')!);
      }
    } finally {
      view.unmount();
    }
  });

  it("a picked year closes the sheet and shows on the row", async () => {
    const view = await mountEdit();
    try {
      await click(findRow("Year")!);
      const pick = [...sheet().querySelectorAll<HTMLButtonElement>("ul button")].find(
        (el) => el.textContent?.trim() === "2022-23",
      );
      assert.ok(pick);
      await click(pick);
      assert.equal(win.document.querySelector('[role="dialog"]'), null);
      assert.ok(rowLabel("Year").includes("2022-23"));
      assert.equal(saveButton().disabled, false);
    } finally {
      view.unmount();
    }
  });
});

describe("Edit card number, money and date sheets", () => {
  it("What you paid opens one focused 16px money field with Done", async () => {
    const view = await mountEdit();
    try {
      await click(findRow("What you paid")!);
      const input = sheet().querySelector("input");
      assert.ok(input instanceof win.HTMLInputElement);
      assert.equal(win.document.activeElement, input, "the keyboard opens for typing");
      assert.equal(input.inputMode, "decimal");
      assert.match(input.className, /\btext-base\b/, "16px, so iOS does not zoom");
      assert.match(input.className, /\bmin-h-12\b/);
      await act(async () => setNativeValue(input, "150"));
      const done = [...sheet().querySelectorAll("button")].find((el) => el.textContent?.trim() === "Done");
      assert.ok(done);
      await click(done);
      assert.ok(rowLabel("What you paid").includes("$150.00"));
    } finally {
      view.unmount();
    }
  });

  it("Purchase date opens a full-width native date picker, never squeezed into a half column", async () => {
    const view = await mountEdit();
    try {
      await click(findRow("Purchase date")!);
      const input = sheet().querySelector("input");
      assert.ok(input instanceof win.HTMLInputElement);
      assert.equal(input.type, "date");
      assert.match(input.className, /\bw-full\b/);
      assert.match(input.className, /\bmin-w-0\b/);
      assert.match(input.className, /\btext-base\b/);
      assert.notEqual(win.document.activeElement, input, "the native picker opens on tap");
      // The old layout put the date and the price side by side in half columns.
      assert.equal(editForm().querySelector(".grid-cols-2"), null);
    } finally {
      view.unmount();
    }
  });

  it("Mark as sold opens a sheet for the sold price and date", async () => {
    const view = await mountEdit();
    try {
      await click(findRow("Mark as sold")!);
      await click([...sheet().querySelectorAll("button")].find((el) => el.textContent?.includes("This card has been sold"))!);
      const price = sheet().querySelector('input[data-field="sellPrice"]');
      const date = sheet().querySelector('input[data-field="sellDate"]');
      assert.ok(price instanceof win.HTMLInputElement);
      assert.ok(date instanceof win.HTMLInputElement);
      assert.equal(date.type, "date");
      await act(async () => {
        setNativeValue(price, "300");
        setNativeValue(date, "2026-11-01");
      });
      await click([...sheet().querySelectorAll("button")].find((el) => el.textContent?.trim() === "Done")!);
      assert.ok(rowLabel("Sold").includes("$300.00"));
      assert.ok(rowLabel("Sold").includes("Nov 1, 2026"));
    } finally {
      view.unmount();
    }
  });

  it("every row and chip is at least 44px tall", async () => {
    const view = await mountEdit();
    try {
      for (const button of editForm().querySelectorAll("button")) {
        if (button.closest("[data-slot='step-dock']")) continue;
        assert.match(button.className, /min-h-1[12]|size-11|min-h-12/, button.textContent ?? "");
      }
    } finally {
      view.unmount();
    }
  });
});

describe("Edit card on an iPhone", () => {
  it("every field on the page and in each sheet is 16px, so iOS never zooms", async () => {
    const view = await mountEdit();
    try {
      await click(findRow("More details")!);
      const labels = ["Player", "Year", "Card #", "What you paid", "Purchase date", "Your estimate", "Serial", "Cert #", "Notes", "Mark as sold"];
      let checked = 0;
      for (const label of labels) {
        await click(findRow(label)!);
        if (label === "Mark as sold") {
          await click([...sheet().querySelectorAll("button")].find((el) => el.textContent?.includes("This card has been sold"))!);
        }
        for (const field of win.document.querySelectorAll<HTMLElement>("input:not([type=file]):not([type=checkbox]), textarea, select")) {
          assert.match(field.className, /\btext-base\b/, `${label}: ${field.outerHTML.slice(0, 80)}`);
          assert.doesNotMatch(field.className, /\b(sm:)?text-(sm|xs)\b/, label);
          checked += 1;
        }
        await click(sheet().querySelector<HTMLButtonElement>('button[aria-label="Close"]')!);
      }
      assert.ok(checked >= 10, `checked ${checked} fields`);
    } finally {
      view.unmount();
    }
  });

  it("shows Current value as a read-only row up with the card, above the Card group", async () => {
    const view = await mountEdit();
    try {
      const value = [...editForm().querySelectorAll("div")].find((el) => el.textContent?.startsWith("Current value") && el.children.length === 2);
      assert.ok(value, "a Current value row");
      const cardGroup = [...editForm().querySelectorAll("section")].find((el) => el.querySelector("h2")?.textContent === "Card");
      assert.ok(cardGroup);
      assert.ok(value.compareDocumentPosition(cardGroup) & win.Node.DOCUMENT_POSITION_FOLLOWING);
    } finally {
      view.unmount();
    }
  });

  it("leaves room for the tab bar and the home indicator under the last row", async () => {
    const view = await mountEdit();
    try {
      assert.match(editForm().className, /pb-\[calc\(5\.5rem\+env\(safe-area-inset-bottom\)\)\]/);
    } finally {
      view.unmount();
    }
  });

  it("Save shows a spinner while the save runs", async () => {
    const view = await mountSlowSave();
    try {
      await click(chip("Auto"));
      await act(async () => {
        fire(editForm(), new win.Event("submit", { bubbles: true, cancelable: true }));
      });
      await waitFor(() => Boolean(win.document.querySelector('[data-slot="save-spinner"]')));
      const busy = win.document.querySelector<HTMLButtonElement>('form[data-slot="edit-card"] button[type="submit"]');
      assert.match(busy?.textContent ?? "", /Saving/);
      assert.equal(busy?.disabled, true, "no second tap while saving");
      assert.equal(editForm().getAttribute("aria-busy"), "true");
      assert.match(win.document.querySelector('[data-slot="save-spinner"]')!.getAttribute("class") ?? "", /motion-reduce:animate-none/);
    } finally {
      view.unmount();
    }
  });
});

/** A collection whose save never settles, to see the saving state. */
async function mountSlowSave() {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  const collection = {
    ready: true,
    loaded: true,
    loadFailed: false,
    cards: [card],
    syncError: null,
    getCard: () => card,
    addCard: () => ({ card, saved: new Promise(() => {}) }),
    updateCard: (id: string, patch: Partial<SportsCard>) => ({ card: { ...card, ...patch, id }, saved: new Promise(() => {}) }),
    removeCard() {},
    reload: async () => [card],
  };
  const social = { ready: true, mode: "local", user: null, createPost: async () => ({ error: null, postId: null }) };
  await act(async () => {
    root.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(
          SocialContext.Provider,
          { value: social as never },
          createElement(CollectionContext.Provider, { value: collection as never }, createElement(CardForm, { existing: card })),
        ),
      ),
    );
  });
  return {
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function editForm(): HTMLFormElement {
  const form = win.document.querySelector<HTMLFormElement>('form[data-slot="edit-card"]');
  assert.ok(form, "the edit form");
  return form;
}

function sheet(): HTMLElement {
  const el = win.document.querySelector<HTMLElement>('[role="dialog"]');
  assert.ok(el, "a sheet is open");
  return el;
}

function findRow(label: string): HTMLButtonElement | undefined {
  return [...win.document.querySelectorAll<HTMLButtonElement>("button[aria-label]")].find((el) =>
    el.getAttribute("aria-label")?.startsWith(`${label}:`),
  );
}

function rowLabel(label: string): string {
  const row = findRow(label);
  assert.ok(row, `${label} row`);
  return row.getAttribute("aria-label") ?? "";
}

function chip(label: string): HTMLButtonElement {
  const el = [...editForm().querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
    (node) => node.textContent?.trim() === label,
  );
  assert.ok(el, `${label} chip`);
  return el;
}

function saveButton(): HTMLButtonElement {
  const el = [...win.document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find(
    (node) => node.textContent?.trim() === "Save",
  );
  assert.ok(el, "Save");
  return el;
}

function keyboardDown(): boolean {
  const el = win.document.activeElement;
  if (!el || el === win.document.body) return true;
  const tag = el.tagName.toLowerCase();
  return tag !== "input" && tag !== "textarea" && tag !== "select";
}

function stored(): SportsCard | undefined {
  const cards = JSON.parse(win.localStorage.getItem(STORAGE_KEY) ?? "[]") as SportsCard[];
  return cards.find((item) => item.id === card.id);
}

function textIncludes(value: string): boolean {
  return win.document.body.textContent?.includes(value) === true;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

async function flushFrames() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

async function mountEdit() {
  win.localStorage.setItem(STORAGE_KEY, JSON.stringify([card]));
  pushed.length = 0;
  const view = await mount({ existing: card });
  await waitFor(() => Boolean(win.document.querySelector('form[data-slot="edit-card"]')));
  return view;
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

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(win.document.body.textContent?.slice(0, 800) ?? "timed out");
}

function Harness({ children }: { children: ReactNode }) {
  const social = useMemo(
    () => ({
      ready: true,
      mode: "local" as const,
      user: null,
      createPost: async () => ({ error: null, postId: null }),
    }),
    [],
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

async function mount(props: CardFormProps) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness, null, createElement(CardForm, props)));
  });
  return {
    unmount() {
      root.unmount();
      host.remove();
    },
  };
}
