import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionContext } from "@/components/collection-provider";
import { PublicCardView } from "@/components/public-card-view";
import { SocialContext } from "@/components/social-provider";
import type { PublicCardOwner } from "@/lib/social/missing-record";
import type { OwnedCard, Profile } from "@/lib/social/types";

const CARD = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
const OWNER = "11111111-1111-4111-8111-111111111111";
const VIEWER = "22222222-2222-4222-8222-222222222222";

const card: OwnedCard = {
  id: CARD,
  ownerId: OWNER,
  playerName: "Jalen Brunson",
  year: 2018,
  setBrand: "Prizm",
  cardNumber: "160",
  sport: "Basketball",
  photoDataUrl: "https://example.test/card.jpg",
  accent: "#7c5cff",
  estimatedSellPrice: 120,
  grade: "PSA 10",
  parallel: "Silver",
  purchasePrice: null,
  openToOffers: true,
};

const owner: PublicCardOwner = { id: OWNER, username: "maya", displayName: "Maya", avatarUrl: null };

const profile: Profile = {
  id: OWNER,
  email: "",
  username: "maya",
  displayName: "Maya",
  bio: "",
  avatarDataUrl: null,
  coverDataUrl: null,
  accent: "#7c5cff",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function render(
  social: {
    ready: boolean;
    user?: { id: string } | null;
    blockedIds?: string[];
    publicCards?: OwnedCard[];
    /** The live public row read. Defaults to done once the app is ready. */
    cardRead?: boolean;
    /** The live row's read failed. */
    cardFailed?: boolean;
  },
  props: { initialCard?: OwnedCard | null; initialOwner?: PublicCardOwner | null } = {},
) {
  const socialValue = {
    ready: social.ready,
    user: social.user ?? null,
    profiles: social.ready ? [profile] : [],
    publicCards: social.publicCards ?? (social.ready ? [card] : []),
    homePosts: [],
    blockedIds: social.blockedIds ?? [],
    mutedIds: [],
    requestPublicCards: () => {},
    requestProfiles: () => {},
    profilesReady: () => true,
    profilesFailed: () => false,
    publicCardsReady: () => social.cardRead ?? social.ready,
    publicCardsFailed: () => social.cardFailed === true,
    profileByUsername: (name: string) => (social.ready && name === "maya" ? profile : undefined),
  };
  const collectionValue = { cards: [], ready: true };
  return renderToStaticMarkup(
    createElement(
      SocialContext.Provider,
      { value: socialValue as never },
      createElement(
        CollectionContext.Provider,
        { value: collectionValue as never },
        createElement(PublicCardView, { username: "maya", id: CARD, ...props }),
      ),
    ),
  );
}

describe("public card view first paint", () => {
  it("paints the server-read card before the social snapshot is ready", () => {
    const html = render({ ready: false }, { initialCard: card, initialOwner: owner });
    assert.doesNotMatch(html, /data-public-card-skeleton/);
    assert.match(html, /Jalen Brunson/);
    assert.match(html, /Maya/);
    // The photo is the LCP element: eager and high priority.
    assert.match(html, /<img[^>]*src="https:\/\/example\.test\/card\.jpg"[^>]*loading="eager"/);
    assert.match(html, /<img[^>]*fetchPriority="high"/i);
  });

  it("holds the viewer-only button's room until the snapshot lands", () => {
    const html = render({ ready: false }, { initialCard: card, initialOwner: owner });
    // No live Message owner link yet, but the same box is reserved.
    assert.doesNotMatch(html, /href="[^"]*"[^>]*>Message owner/);
    assert.match(html, /aria-hidden="true"[^>]*invisible[^>]*>Message owner|invisible[^>]*aria-hidden="true"[^>]*>Message owner/);
    const ready = render({ ready: true }, { initialCard: card, initialOwner: owner });
    assert.match(ready, /href="[^"]*"[^>]*>Message owner/);
  });

  it("still shows the skeleton with no server card", () => {
    assert.match(render({ ready: false }), /data-public-card-skeleton/);
  });

  it("keeps today's rules once the snapshot is ready", () => {
    // A blocked owner has no message link.
    const blocked = render(
      { ready: true, user: { id: VIEWER }, blockedIds: [OWNER] },
      { initialCard: card, initialOwner: owner },
    );
    assert.doesNotMatch(blocked, /Message owner/);
    // The live public row is the source of truth once it is read.
    const gone = render({ ready: true, publicCards: [] }, { initialCard: card, initialOwner: owner });
    assert.match(gone, /This card isn&#x27;t public/);
  });

  it("keeps the server card up while its live row is still being read", () => {
    const pending = render(
      { ready: true, publicCards: [], cardRead: false },
      { initialCard: card, initialOwner: owner },
    );
    assert.match(pending, /Jalen Brunson/);
    assert.doesNotMatch(pending, /This card isn&#x27;t public|data-public-card-skeleton/);
    // No server card and nothing read yet: the skeleton, not "isn't public".
    const cold = render({ ready: true, publicCards: [], cardRead: false });
    assert.match(cold, /data-public-card-skeleton/);
  });

  it("keeps the server card when the live read fails, and never says not public or not found", () => {
    const failed = render(
      { ready: true, publicCards: [], cardRead: false, cardFailed: true },
      { initialCard: card, initialOwner: owner },
    );
    assert.match(failed, /Jalen Brunson/);
    assert.doesNotMatch(failed, /This card isn&#x27;t public|not found|data-public-card-skeleton/);
    // No server card to stand in: a retry, not a missing card.
    const cold = render({ ready: true, publicCards: [], cardRead: false, cardFailed: true });
    assert.match(cold, /Couldn&#x27;t load this card/);
    assert.match(cold, /data-public-card-retry/);
    assert.doesNotMatch(cold, /This card isn&#x27;t public|not found/);
  });
});
