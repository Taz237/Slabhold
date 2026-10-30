import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASK_COOLDOWN_MS,
  EMPTY_ASK,
  PUSH_RELEASE_AT,
  askSurface,
  dismissedState,
  parseAskState,
  shouldAsk,
  shownState,
  startsFirstOpen,
  type AskInput,
} from "./soft-ask";

const NOW = PUSH_RELEASE_AT + 30 * 24 * 60 * 60 * 1000;
const NEW_ACCOUNT = PUSH_RELEASE_AT + 1000;
const OLD_ACCOUNT = PUSH_RELEASE_AT - 90 * 24 * 60 * 60 * 1000;

function input(partial: Partial<AskInput> = {}): AskInput {
  return {
    trigger: "action",
    featureOn: true,
    signedIn: true,
    firstOpen: false,
    busy: false,
    shownThisSession: false,
    surface: "push",
    state: { ...EMPTY_ASK, firstSeenAt: NOW - 1000 },
    now: NOW,
    standalone: true,
    accountCreatedAt: NEW_ACCOUNT,
    pathname: "/",
    ...partial,
  };
}

describe("push soft-ask scheduler", () => {
  it("never asks on first open", () => {
    assert.equal(startsFirstOpen({ state: EMPTY_ASK, accountCreatedAt: NEW_ACCOUNT }), true);
    assert.equal(shouldAsk(input({ firstOpen: true })), false);
    // A later session is not a first open.
    assert.equal(startsFirstOpen({ state: { ...EMPTY_ASK, firstSeenAt: NOW - 5000 }, accountCreatedAt: NEW_ACCOUNT }), false);
  });

  it("asks after a follow, post or like", () => {
    assert.equal(shouldAsk(input()), true);
  });

  it("waits for onboarding, modals, the composer and auth pages", () => {
    assert.equal(shouldAsk(input({ busy: true })), false);
  });

  it("holds 7 days after Not now, and stops after 3", () => {
    const once = dismissedState(EMPTY_ASK, NOW);
    assert.equal(shouldAsk(input({ state: once, now: NOW + ASK_COOLDOWN_MS - 1 })), false);
    assert.equal(shouldAsk(input({ state: once, now: NOW + ASK_COOLDOWN_MS })), true);
    const thrice = dismissedState(dismissedState(once, NOW), NOW);
    assert.equal(thrice.dismissals, 3);
    assert.equal(shouldAsk(input({ state: thrice, now: NOW + 10 * ASK_COOLDOWN_MS })), false);
  });

  it("shows at most once per session", () => {
    assert.equal(shouldAsk(input({ shownThisSession: true })), false);
  });

  it("sends iOS Safari tabs to Add to Home Screen, and in-app browsers get nothing", () => {
    assert.equal(askSurface({ platform: "ios-safari", pushSupported: false, permission: "unsupported" }), "add-to-home");
    assert.equal(askSurface({ platform: "in-app", pushSupported: true, permission: "default" }), null);
    assert.equal(askSurface({ platform: "ios-browser", pushSupported: false, permission: "unsupported" }), null);
    assert.equal(askSurface({ platform: "installed", pushSupported: true, permission: "default" }), "push");
    assert.equal(askSurface({ platform: "android", pushSupported: true, permission: "granted" }), null);
    assert.equal(askSurface({ platform: "desktop", pushSupported: true, permission: "denied" }), null);
    assert.equal(askSurface({ platform: "desktop", pushSupported: false, permission: "unsupported" }), null);
    assert.equal(shouldAsk(input({ surface: null })), false);
  });

  it("offers existing installed users the card once on their next open, on Home", () => {
    const existing = input({ trigger: "existing-open", accountCreatedAt: OLD_ACCOUNT, state: EMPTY_ASK });
    assert.equal(startsFirstOpen({ state: EMPTY_ASK, accountCreatedAt: OLD_ACCOUNT }), false);
    assert.equal(shouldAsk(existing), true);
    assert.equal(shouldAsk({ ...existing, pathname: "/collection" }), false);
    assert.equal(shouldAsk({ ...existing, standalone: false }), false);
    assert.equal(shouldAsk({ ...existing, accountCreatedAt: NEW_ACCOUNT }), false);
    assert.equal(shouldAsk({ ...existing, state: shownState(EMPTY_ASK, NOW - ASK_COOLDOWN_MS * 2) }), false);
    assert.equal(shouldAsk({ ...existing, surface: "add-to-home" }), false);
  });

  it("is off with the feature switch off", () => {
    assert.equal(shouldAsk(input({ featureOn: false })), false);
    assert.equal(shouldAsk(input({ signedIn: false })), false);
  });

  it("reads stored state defensively", () => {
    assert.deepEqual(parseAskState("not json"), EMPTY_ASK);
    assert.deepEqual(parseAskState(JSON.stringify({ dismissals: 2, lastAt: 5 })), { dismissals: 2, lastAt: 5, firstSeenAt: null });
    assert.deepEqual(parseAskState(JSON.stringify({ dismissals: "x" })), EMPTY_ASK);
  });
});
