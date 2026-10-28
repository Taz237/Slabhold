import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { createElement, act, useMemo, type ComponentType, type ReactNode } from "react";
import { CollectionProvider } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import type { CatalogCard } from "@/lib/card-catalog";
import type { SportsCard } from "@/lib/types";

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

const fixtureCard: SportsCard = {
  id: "fixture-edit",
  playerName: "Fixture Player",
  year: 2024,
  yearLabel: "2024",
  setBrand: "Panini Prizm",
  setIsCustom: false,
  cardNumber: "12",
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
  notes: "",
  photoDataUrl: null,
  accent: "#7c5cff",
  category: "pc",
  isPublic: false,
  openToOffers: false,
  createdAt: "2024-01-02T00:00:00.000Z",
  updatedAt: "2024-01-02T00:00:00.000Z",
};

const pickedOnSearch: CatalogCard = {
  id: "fixture-catalog",
  playerName: "Victor Wembanyama",
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  cardNumber: "136",
  sport: "Basketball",
  parallel: "Base",
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

type CardFormProps = { existing?: SportsCard; initialCatalog?: CatalogCard | null };
let CardForm: ComponentType<CardFormProps>;

describe("add card photo block", () => {
  before(async () => {
    ({ CardForm } = await import("@/components/card-form"));
  });

  after(() => {
    win.close();
  });

  it("shows both photo inputs and buttons on top of Add, outside More details", async () => {
    win.localStorage.clear();
    const view = await mount({});
    try {
      await waitFor(() => textIncludes("Add a card"));
      const cameras = fileInputs('[data-photo-input="camera"]');
      const libraries = fileInputs('[data-photo-input="library"]');
      assert.equal(cameras.length, 1);
      assert.equal(libraries.length, 1);
      const [camera] = cameras;
      const [library] = libraries;
      assert.equal(camera.getAttribute("capture"), "environment");
      assert.equal(library.hasAttribute("capture"), false);
      for (const input of [camera, library]) {
        assert.match(input.getAttribute("accept") ?? "", /image\/\*/);
        assert.match(input.getAttribute("accept") ?? "", /\.heic/);
      }

      const take = button("Take photo");
      const choose = button("Choose from library");
      const tile = win.document.querySelector<HTMLButtonElement>('button[aria-label="Choose a photo"]');
      assert.ok(tile);
      for (const el of [camera, library, take, choose, tile]) {
        assert.equal(el.closest("details") === null, true, "photo controls sit outside More details");
      }

      const player = field("playerName");
      assert.ok(
        camera.compareDocumentPosition(player) & win.Node.DOCUMENT_POSITION_FOLLOWING,
        "photo block comes before Player",
      );
      assert.ok(take.compareDocumentPosition(player) & win.Node.DOCUMENT_POSITION_FOLLOWING);
    } finally {
      view.unmount();
    }
  });

  it("opens the camera from Take photo and the library from the tile and Choose from library", async () => {
    win.localStorage.clear();
    const view = await mount({});
    const clicked: string[] = [];
    const original = win.HTMLInputElement.prototype.click;
    win.HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
      clicked.push(this.getAttribute("data-photo-input") ?? this.type);
    };
    try {
      await waitFor(() => textIncludes("Add a card"));
      await act(async () => {
        button("Take photo").click();
      });
      assert.deepEqual(clicked, ["camera"]);
      await act(async () => {
        button("Choose from library").click();
      });
      assert.deepEqual(clicked, ["camera", "library"]);
      await act(async () => {
        win.document.querySelector<HTMLButtonElement>('button[aria-label="Choose a photo"]')!.click();
      });
      assert.deepEqual(clicked, ["camera", "library", "library"]);
    } finally {
      win.HTMLInputElement.prototype.click = original;
      view.unmount();
    }
  });

  it("has no player search on Add", async () => {
    win.localStorage.clear();
    const view = await mount({});
    try {
      await waitFor(() => textIncludes("Add a card"));
      assert.equal(textIncludes("Not seeing your card?"), false);
      assert.equal(win.document.querySelector('input[type="search"]') === null, true);
      assert.equal(win.document.querySelector('[role="combobox"]') === null, true, "no search input");
      assert.equal(textIncludes("Search for your card"), false);
      assert.ok(textIncludes("Snap a photo or fill in the basics. Everything else is optional."));
      assert.ok(textIncludes("What you paid, notes, sharing"));
    } finally {
      view.unmount();
    }
  });

  it("still prefills Add from a card picked on Search", async () => {
    win.localStorage.clear();
    const view = await mount({ initialCatalog: pickedOnSearch });
    try {
      await waitFor(() => textIncludes("Add a card"));
      assert.equal((field("playerName") as HTMLInputElement).value, "Victor Wembanyama");
      assert.match(field("yearLabel").textContent ?? "", /2023-24/);
      assert.match(field("setBrand").textContent ?? "", /Panini Prizm/);
      assert.equal((field("cardNumber") as HTMLInputElement).value, "136");
    } finally {
      view.unmount();
    }
  });

  it("still offers the catalog match chip for a typed exact match", async () => {
    win.localStorage.clear();
    const view = await mount({});
    try {
      await waitFor(() => textIncludes("Add a card"));
      await act(async () => {
        setNativeValue(field("playerName"), "Victor Wembanyama");
      });
      await chooseSearch("yearLabel", "2023-24");
      await chooseSearch("setBrand", "Panini Prizm");
      await act(async () => {
        setNativeValue(field("cardNumber"), "136");
      });
      await waitFor(() => textIncludes("Is this your card?"), 200);
      assert.ok(button("Use this"));
    } finally {
      view.unmount();
    }
  });

  it("keeps the Edit layout: photo near the top and nothing tucked away", async () => {
    win.localStorage.clear();
    const view = await mount({ existing: fixtureCard });
    try {
      await waitFor(() => textIncludes("Edit Fixture Player"));
      assert.equal(win.document.querySelector("details") === null, true);
      const [camera] = fileInputs('[data-photo-input="camera"]');
      assert.ok(camera);
      assert.ok(camera.compareDocumentPosition(field("playerName")) & win.Node.DOCUMENT_POSITION_FOLLOWING);
      assert.ok(win.document.querySelector("textarea"), "notes visible");
      assert.ok(textIncludes("Player, set, what you paid, and a photo."));
    } finally {
      view.unmount();
    }
  });
});

function fileInputs(selector: string): HTMLInputElement[] {
  return [...win.document.querySelectorAll<HTMLInputElement>(`input[type="file"]${selector}`)];
}

function button(label: string): HTMLButtonElement {
  const el = [...win.document.querySelectorAll("button")].find((node) =>
    node.textContent?.includes(label),
  );
  assert.ok(el instanceof win.HTMLButtonElement, `${label} button`);
  return el;
}

function textIncludes(value: string): boolean {
  return win.document.body.textContent?.includes(value) === true;
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

async function waitFor(check: () => boolean, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
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
