import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ReactElement } from "react";
import type { SocialContextValue } from "@/components/social-provider";
import type { OwnedCard, Profile } from "@/lib/social/types";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000/messages/maya" });
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("self", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("IS_REACT_ACT_ENVIRONMENT", true);

const CARD = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
const OWNER = "11111111-1111-4111-8111-111111111111";

const owner: Profile = {
  id: OWNER,
  email: "",
  username: "maya",
  displayName: "Maya",
  bio: "",
  avatarDataUrl: null,
  coverDataUrl: null,
  accent: "#7c5cff",
  createdAt: "2025-01-01T00:00:00.000Z",
};

const card: OwnedCard = {
  id: CARD,
  ownerId: OWNER,
  playerName: "Jalen Brunson",
  year: 2018,
  setBrand: "Prizm",
  cardNumber: "160",
  sport: "Basketball",
  photoDataUrl: null,
  accent: "#7c5cff",
  estimatedSellPrice: 120,
  grade: "Raw",
  parallel: "Base",
  purchasePrice: null,
  openToOffers: true,
};

/** A provider value that records what is asked for and answers from `loaded`. */
function social(loaded: { cards: OwnedCard[]; ready: boolean }) {
  const asked: string[][] = [];
  const value = {
    ready: true,
    mode: "supabase",
    user: null,
    profiles: [owner],
    publicCards: loaded.cards,
    blockedIds: [],
    findPost: () => undefined,
    postCardValues: new Map(),
    postCardValuesLoading: false,
    requestPublicCards: (keys: readonly string[]) => {
      asked.push([...keys]);
    },
    publicCardsReady: () => loaded.ready,
  } as unknown as SocialContextValue;
  return { value, asked };
}

async function render(value: SocialContextValue, child: ReactElement) {
  const { SocialContext } = await import("@/components/social-provider");
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(SocialContext.Provider, { value }, child)));
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("public cards a screen asks for", () => {
  after(() => win.close());

  it("asks for a shared card by id and holds its spot while the row loads", async () => {
    const { CardMessagePreviewCard } = await import("@/components/open-to-offers");
    const preview = { cardId: CARD } as never;

    const pending = social({ cards: [], ready: false });
    const loading = await render(pending.value, createElement(CardMessagePreviewCard, { preview }));
    assert.deepEqual(pending.asked, [[`id:${CARD}`]]);
    assert.ok(loading.host.querySelector("[data-shared-card-pending]"));
    assert.doesNotMatch(loading.host.textContent ?? "", /no longer available/);
    loading.unmount();

    const gone = await render(social({ cards: [], ready: true }).value, createElement(CardMessagePreviewCard, { preview }));
    assert.match(gone.host.textContent ?? "", /Card no longer available/);
    gone.unmount();

    const found = await render(social({ cards: [card], ready: true }).value, createElement(CardMessagePreviewCard, { preview }));
    assert.ok(found.host.querySelector("[data-shared-card]"));
    assert.match(found.host.textContent ?? "", /Jalen Brunson/);
    found.unmount();
  });

  it("asks for the cards linked in a message, and only those", async () => {
    const { MessageAttachments } = await import("@/components/message-attachments");
    const probe = social({ cards: [card], ready: true });
    const view = await render(
      probe.value,
      createElement(MessageAttachments, { text: `look https://slabhold.app/u/maya/cards/${CARD} and /posts/abc` }),
    );
    assert.deepEqual(probe.asked, [[`id:${CARD}`]]);
    assert.ok(view.host.querySelector("[data-shared-card]"));
    view.unmount();

    const quiet = social({ cards: [], ready: true });
    (await render(quiet.value, createElement(MessageAttachments, { text: "no links here" }))).unmount();
    assert.deepEqual(quiet.asked, []);
  });

  it("asks for a post card's row only when its value has nothing to show", async () => {
    const { useAttachedChip } = await import("@/lib/social/use-attachment-label");
    function Chip({ known }: { known: boolean }) {
      const values = known ? new Map([[CARD, null as never]]) : new Map();
      useAttachedChip(card, { values });
      return null;
    }
    const noValue = social({ cards: [], ready: true });
    (await render(noValue.value, createElement(Chip, { known: true }))).unmount();
    assert.deepEqual(noValue.asked, [[`id:${CARD}`]]);

    const stillLoading = social({ cards: [], ready: true });
    (await render(stillLoading.value, createElement(Chip, { known: false }))).unmount();
    assert.deepEqual(stillLoading.asked, []);
  });

  it("is wired into every screen that used the site-wide list", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    assert.match(read("components/search-view.tsx"), /usePublicCards\(catalogCards\.length > 0 \? \{ players: catalogCards\.map/);
    assert.match(read("components/message-thread.tsx"), /usePublicCards\(\{ ids: \[cardParam\] \}\)/);
    assert.match(read("components/card-posts-list.tsx"), /usePublicCards\(owned \? null : \{ ids: \[cardId\] \}\)/);
    assert.match(read("components/public-card-view.tsx"), /usePublicCards\(\{ ids: \[id\] \}\)/);
    assert.match(read("components/profile-view.tsx"), /requestPublicCards\(publicCardKeys\(\{ ownerId \}\)\)/);
    assert.match(read("components/message-attachments.tsx"), /usePublicCards\(\{\n\s+ids: \[last\.cardPreview\?\.cardId/);
  });
});
