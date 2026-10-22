import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { createElement, act, useMemo, type ComponentType, type ReactNode } from "react";
import { CollectionProvider } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { STORAGE_KEY } from "@/lib/storage";
import type { SportsCard } from "@/lib/types";
import { cardNumberAllowsSave } from "./card-number-save";

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

const NUMBER_MESSAGE =
  "Enter a card number (letters, digits, dashes) or check No number";

const blankCard: SportsCard = {
  id: "jaylen-blank",
  playerName: "Jaylen Brown",
  year: 2024,
  yearLabel: "2024",
  setBrand: "Panini Prizm",
  setIsCustom: false,
  cardNumber: "",
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
  purchasePrice: 12,
  purchaseDate: "2024-01-02",
  estimatedSellPrice: 20,
  sellPrice: null,
  sellDate: null,
  notes: "before",
  photoDataUrl: null,
  accent: "#7c5cff",
  category: "flipping",
  isPublic: true,
  openToOffers: false,
  createdAt: "2024-01-02T00:00:00.000Z",
  updatedAt: "2024-01-02T00:00:00.000Z",
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

type CardFormProps = { existing?: SportsCard };
let CardForm: ComponentType<CardFormProps>;

describe("card number pattern", () => {
  for (const cardNumber of [" #12", "##12"]) {
    for (const isEdit of [false, true]) {
      it(`rejects ${JSON.stringify(cardNumber)} on ${isEdit ? "edit" : "add"}`, () => {
        assert.equal(
          cardNumberAllowsSave({ isEdit, noNumber: false, cardNumber }),
          false,
        );
      });
    }
  }
});

describe("card form submit", () => {
  before(async () => {
    ({ CardForm } = await import("@/components/card-form"));
  });

  after(() => {
    win.close();
  });

  it("saves an edit when the number is blank and No number is unchecked", async () => {
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify([blankCard]));
    const view = await mount({ existing: blankCard });
    try {
      await waitFor(() => storedCard("jaylen-blank") != null);
      const notes = win.document.querySelector("textarea");
      assert.ok(notes);
      await act(async () => {
        setNativeValue(notes, "signed");
      });
      await submit();
      await waitFor(() => storedCard("jaylen-blank")?.notes === "signed");
      const saved = storedCard("jaylen-blank");
      assert.equal(saved?.cardNumber, "");
      assert.equal(saved?.noNumber, false);
      assert.equal(numberInput().hasAttribute("required"), false);
    } finally {
      view.unmount();
    }
  });

  it("shows the inline number message when Add is blank and No number is unchecked", async () => {
    win.localStorage.clear();
    const view = await mount({});
    try {
      await waitFor(() => textIncludes("Add a card"));
      assert.equal(numberInput().hasAttribute("required"), false);
      await submit();
      await waitFor(() => textIncludes(NUMBER_MESSAGE));
      assert.equal(
        storedCards().some((card) => card.playerName === "" && card.cardNumber === ""),
        false,
      );
    } finally {
      view.unmount();
    }
  });

  it("saves an empty number on Add when No number is checked", async () => {
    win.localStorage.clear();
    const view = await mount({});
    try {
      await waitFor(() => textIncludes("Add a card"));
      await act(async () => {
        setNativeValue(field("playerName"), "Jaylen Brown");
      });
      await chooseSearch("yearLabel", "2024");
      await chooseSearch("setBrand", "Test Set");
      await act(async () => {
        setNativeValue(field("gradingCompany"), "Raw / Ungraded");
      });
      await act(async () => {
        noNumberBox().click();
      });
      await submit();
      await waitFor(() => storedCards().some((card) => card.playerName === "Jaylen Brown"));
      const saved = storedCards().find((card) => card.playerName === "Jaylen Brown");
      assert.equal(saved?.cardNumber, "");
      assert.equal(saved?.noNumber, true);
    } finally {
      view.unmount();
    }
  });
});

function textIncludes(value: string): boolean {
  return win.document.body.textContent?.includes(value) === true;
}

function storedCards(): SportsCard[] {
  const raw = win.localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as SportsCard[]) : [];
}

function storedCard(id: string): SportsCard | undefined {
  return storedCards().find((card) => card.id === id);
}

function numberInput(): HTMLInputElement {
  const input = win.document.querySelector('[aria-label="Card number"]');
  assert.ok(input instanceof win.HTMLInputElement);
  return input;
}

function noNumberBox(): HTMLInputElement {
  const label = [...win.document.querySelectorAll("label")].find((node) =>
    node.textContent?.includes("No number on card"),
  );
  const box = label?.querySelector("input");
  assert.ok(box instanceof win.HTMLInputElement);
  return box;
}

function field(name: string): HTMLElement {
  const el = win.document.querySelector(`[data-field="${name}"]`);
  assert.ok(el instanceof win.HTMLElement);
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

async function chooseSearch(name: string, text: string) {
  await act(async () => {
    field(name).click();
  });
  const input = win.document.querySelector('[role="dialog"] input');
  assert.ok(input instanceof win.HTMLInputElement);
  await act(async () => {
    setNativeValue(input, text);
    fire(input, new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

async function submit() {
  const form = win.document.querySelector("form");
  assert.ok(form);
  await act(async () => {
    fire(form, new win.Event("submit", { bubbles: true, cancelable: true }));
  });
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
