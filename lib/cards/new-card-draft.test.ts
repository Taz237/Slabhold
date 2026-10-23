import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { after, before, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { createElement, act, useMemo, type ComponentType, type ReactNode } from "react";
import { CollectionProvider } from "@/components/collection-provider";
import { SocialContext, SocialProvider, useSocial } from "@/components/social-provider";
import { STORAGE_KEY } from "@/lib/storage";
import type { SportsCard } from "@/lib/types";
import {
  assessNewCardSubmit,
  clearNewCardDraft,
  formForSubmit,
  newCardSeed,
  readNewCardDraft,
  writeNewCardDraft,
  type CardDraftForm,
  type NewCardDraft,
} from "./new-card-draft";

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

const emptyForm: CardDraftForm = {
  playerName: "",
  yearLabel: "",
  setBrand: "",
  cardNumber: "",
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

const typedForm: CardDraftForm = {
  ...emptyForm,
  playerName: "Victor Wembanyama",
  yearLabel: "2024",
  setBrand: "Test Set",
  cardNumber: "136",
};

const sharePost = { error: null as string | null, calls: 0 };

function draftFor(form: CardDraftForm, userId: string | null = null): NewCardDraft {
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
    share: false,
    openToOffers: false,
    shareToFeed: false,
    caption: "",
    category: "pc",
    sportTouched: false,
    sportOffer: "",
  };
}

const blankCard: SportsCard = {
  id: "jaylen-blank",
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

describe("new card draft", () => {
  beforeEach(() => {
    clearNewCardDraft();
  });

  it("validates the persisted card when the render snapshot is empty", () => {
    const resolved = formForSubmit(emptyForm, typedForm);
    assert.equal(resolved, typedForm);
    assert.equal(formForSubmit(emptyForm, null), emptyForm);

    const wiped = assessNewCardSubmit({
      isEdit: false,
      form: emptyForm,
      noNumber: false,
      gradeCompany: "Raw / Ungraded",
      gradeNumber: "",
      sold: false,
    });
    assert.equal(wiped.ok, false);
    assert.equal(wiped.playerOk, false);
    assert.equal(wiped.yearOk, false);
    assert.equal(wiped.setOk, false);
    assert.equal(wiped.cardNumberOk, false);

    const current = assessNewCardSubmit({
      isEdit: false,
      form: resolved,
      noNumber: false,
      gradeCompany: "Raw / Ungraded",
      gradeNumber: "",
      sold: false,
    });
    assert.equal(current.ok, true);
    assert.equal(current.grading.grade, "Raw");
    assert.equal(current.conditionType, "raw");
  });

  it("returns null when the draft belongs to a different user", () => {
    writeNewCardDraft(draftFor(typedForm, "user-a"));
    assert.equal(readNewCardDraft(newCardSeed("", null), "user-b"), null);
    assert.equal(readNewCardDraft(newCardSeed("", null), null), null);
    assert.equal(readNewCardDraft(newCardSeed("", null), "user-a")?.form.playerName, "Victor Wembanyama");
    assert.equal(readNewCardDraft("other\n", "user-a"), null);
  });
});

describe("add card survives a remount", () => {
  before(async () => {
    ({ CardForm } = await import("@/components/card-form"));
  });

  beforeEach(() => {
    win.localStorage.clear();
    clearNewCardDraft();
    sharePost.error = null;
    sharePost.calls = 0;
  });

  after(() => {
    clearNewCardDraft();
  });

  it("keeps typed fields after unmount and saves them", async () => {
    const view = await mount({});
    try {
      await waitFor(() => textIncludes("Add a card"));
      await fillIdentity();
      assert.equal(readNewCardDraft(newCardSeed("", null), null)?.form.playerName, "Jaylen Brown");
    } finally {
      view.unmount();
    }

    const again = await mount({});
    try {
      await waitFor(() => inputValue("playerName") === "Jaylen Brown");
      assert.match(buttonText("yearLabel"), /2024/);
      assert.match(buttonText("setBrand"), /Test Set/);
      assert.equal(inputValue("cardNumber"), "136");
      assert.equal(textIncludes("Player name is required"), false);
      assert.equal(textIncludes("Year is required"), false);
      assert.equal(textIncludes("Set is required"), false);
      await submit();
      await waitFor(() => storedCards().some((card) => card.playerName === "Jaylen Brown"));
      const saved = storedCards().find((card) => card.playerName === "Jaylen Brown");
      assert.equal(saved?.yearLabel, "2024");
      assert.equal(saved?.setBrand, "Test Set");
      assert.equal(saved?.cardNumber, "136");
      assert.equal(saved?.grade, "Raw");
      assert.equal(readNewCardDraft(newCardSeed("", null), null), null);
    } finally {
      again.unmount();
    }
  });

  it("keeps filled fields when the first submit is rejected", async () => {
    const view = await mount({});
    try {
      await waitFor(() => textIncludes("Add a card"));
      await act(async () => {
        setNativeValue(field("playerName"), "Jaylen Brown");
      });
      await chooseSearch("yearLabel", "2024");
      await chooseSearch("setBrand", "Test Set");
      await submit();
      await waitFor(() => textIncludes(NUMBER_MESSAGE));
      assert.equal(inputValue("playerName"), "Jaylen Brown");
      assert.match(buttonText("yearLabel"), /2024/);
      assert.match(buttonText("setBrand"), /Test Set/);
      assert.equal(
        storedCards().some((card) => card.playerName === "Jaylen Brown"),
        false,
      );
    } finally {
      view.unmount();
    }

    const again = await mount({});
    try {
      await waitFor(() => inputValue("playerName") === "Jaylen Brown");
      assert.match(buttonText("yearLabel"), /2024/);
      assert.match(buttonText("setBrand"), /Test Set/);
      assert.equal(inputValue("cardNumber"), "");
      assert.equal(
        storedCards().some((card) => card.playerName === "Jaylen Brown"),
        false,
      );
    } finally {
      again.unmount();
    }
  });

  it("does not apply a new-card draft to an edit", async () => {
    writeNewCardDraft(draftFor(typedForm));
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify([blankCard]));
    const view = await mount({ existing: blankCard });
    try {
      await waitFor(() => inputValue("playerName") === "Jaylen Brown");
      assert.equal(inputValue("playerName"), "Jaylen Brown");
      assert.match(buttonText("setBrand"), /Panini Prizm/);
      assert.equal(readNewCardDraft(newCardSeed("", null), null)?.form.playerName, "Victor Wembanyama");
    } finally {
      view.unmount();
    }
  });

  it("drops the draft after the card is saved when sharing fails, and does not insert again", async () => {
    sharePost.error = "feed down";
    const view = await mount({});
    try {
      await waitFor(() => textIncludes("Add a card"));
      await fillIdentity();
      await clickVisibility("Public");
      await clickCheckbox("Share to feed");
      await submit();
      await waitFor(() => textIncludes("Saved the card, but couldn't share it to the feed."));
      assert.equal(readNewCardDraft(newCardSeed("", null), null), null);
      assert.equal(storedCards().filter((card) => card.playerName === "Jaylen Brown").length, 1);
      await submit();
      await waitFor(() => sharePost.calls >= 2);
      assert.equal(storedCards().filter((card) => card.playerName === "Jaylen Brown").length, 1);
      assert.equal(readNewCardDraft(newCardSeed("", null), null), null);
    } finally {
      view.unmount();
    }
  });

  it("offers Start over and says when a restored draft lost its photo", async () => {
    writeNewCardDraft({ ...draftFor(typedForm), hadPhoto: true });
    const view = await mount({});
    try {
      await waitFor(() => inputValue("playerName") === "Victor Wembanyama");
      assert.equal(textIncludes("Photo needs re-adding"), true);
      assert.equal(textIncludes("Start over"), true);
      const button = [...win.document.querySelectorAll("button")].find((node) =>
        node.textContent?.includes("Start over"),
      );
      assert.ok(button);
      await act(async () => {
        button.click();
      });
      await waitFor(() => inputValue("playerName") === "");
      assert.equal(textIncludes("Photo needs re-adding"), false);
      assert.equal(textIncludes("Victor Wembanyama"), false);
      assert.equal(readNewCardDraft(newCardSeed("", null), null), null);
    } finally {
      view.unmount();
    }
  });
});

describe("sign out drops the new-card draft", () => {
  beforeEach(() => {
    clearNewCardDraft();
  });

  after(() => {
    clearNewCardDraft();
    win.close();
  });

  it("signOut clears the draft", async () => {
    const provider = readFileSync("components/social-provider.tsx", "utf8");
    const signOut = provider.slice(
      provider.indexOf("const signOut = useCallback"),
      provider.indexOf("const updateProfile = useCallback"),
    );
    assert.match(signOut, /clearNewCardDraft\(\)/);
    assert.match(provider, /seenDraftUserId\.current === suggestionUserId/);
    const more = readFileSync("components/more-view.tsx", "utf8");
    const logout = more.slice(more.indexOf("markLogoutHome()"), more.indexOf("Log out"));
    assert.match(logout, /clearNewCardDraft\(\)/);
    const remove = readFileSync("components/delete-account.tsx", "utf8");
    const clearAt = remove.indexOf("clearNewCardDraft()");
    const signAt = remove.indexOf("await signOut()");
    assert.ok(clearAt > 0 && signAt > clearAt);

    writeNewCardDraft(draftFor(typedForm, "user-a"));
    const view = await mountSignOut();
    try {
      await waitFor(() =>
        [...win.document.querySelectorAll("button")].some((node) => node.textContent === "Log out"),
      );
      const button = [...win.document.querySelectorAll("button")].find(
        (node) => node.textContent === "Log out",
      );
      assert.ok(button);
      await act(async () => {
        button.click();
      });
      await waitFor(() => readNewCardDraft(newCardSeed("", null), "user-a") === null);
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

function field(name: string): HTMLElement {
  const el = win.document.querySelector(`[data-field="${name}"]`);
  assert.ok(el instanceof win.HTMLElement);
  return el;
}

function inputValue(name: string): string {
  const el = field(name);
  assert.ok(el instanceof win.HTMLInputElement);
  return el.value;
}

function buttonText(name: string): string {
  return field(name).textContent ?? "";
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

async function clickVisibility(label: "Public" | "Private") {
  const match = [...win.document.querySelectorAll('[role="radio"]')].find(
    (node) => node.textContent?.trim() === label,
  );
  assert.ok(match instanceof win.HTMLButtonElement);
  await act(async () => {
    match.click();
  });
}

async function clickCheckbox(label: string) {
  const match = [...win.document.querySelectorAll("label")].find((node) =>
    node.textContent?.includes(label),
  );
  const box = match?.querySelector("input");
  assert.ok(box instanceof win.HTMLInputElement);
  await act(async () => {
    box.click();
  });
}

async function fillIdentity() {
  await act(async () => {
    setNativeValue(field("playerName"), "Jaylen Brown");
  });
  await chooseSearch("yearLabel", "2024");
  await chooseSearch("setBrand", "Test Set");
  await act(async () => {
    setNativeValue(field("cardNumber"), "136");
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
      createPost: async () => {
        sharePost.calls += 1;
        return { error: sharePost.error, postId: null };
      },
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

function SignOutProbe() {
  const { signOut } = useSocial();
  return createElement(
    "button",
    { type: "button", onClick: () => void signOut() },
    "Log out",
  );
}

async function mountSignOut() {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(SocialProvider, null, createElement(SignOutProbe)),
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
