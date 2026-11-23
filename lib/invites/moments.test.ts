import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INVITE_MOMENT_COPY,
  INVITE_MOMENT_VISIT_MS,
  INVITE_MOMENT_WEEK_MS,
  dismissInviteMoment,
  homeInviteEligible,
  inviteMomentKey,
  leaderboardInviteEligible,
  markInviteMomentShown,
  readInviteMoment,
  shouldShowInviteMoment,
} from "./moments";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const T0 = Date.UTC(2026, 10, 22, 12);
const DAY = 24 * 60 * 60 * 1000;

describe("invite moment copy", () => {
  it("has the three moments' words, with no banned words", () => {
    assert.equal(INVITE_MOMENT_COPY.home, "Your feed gets better with your card buddies. Invite one.");
    assert.equal(INVITE_MOMENT_COPY.added, "Show a buddy");
    assert.equal(INVITE_MOMENT_COPY.leaderboard, "Bring a buddy onto this board");
    for (const text of Object.values(INVITE_MOMENT_COPY)) {
      assert.doesNotMatch(text, /\b(best|ai|free|number one|flip)\b/i);
    }
  });
});

describe("home invite row", () => {
  it("shows under 5 follows once ready, and hides from 5 up", () => {
    assert.equal(homeInviteEligible({ ready: true, signedIn: true, following: 0, busy: false }), true);
    assert.equal(homeInviteEligible({ ready: true, signedIn: true, following: 4, busy: false }), true);
    assert.equal(homeInviteEligible({ ready: true, signedIn: true, following: 5, busy: false }), false);
    assert.equal(homeInviteEligible({ ready: true, signedIn: true, following: 40, busy: false }), false);
  });

  it("hides while loading, signed out, or while another first-run card is up", () => {
    assert.equal(homeInviteEligible({ ready: false, signedIn: true, following: 0, busy: false }), false);
    assert.equal(homeInviteEligible({ ready: true, signedIn: false, following: 0, busy: false }), false);
    assert.equal(homeInviteEligible({ ready: true, signedIn: true, following: 0, busy: true }), false);
  });
});

describe("leaderboard invite row", () => {
  it("shows under your own rank on this week's board only", () => {
    assert.equal(leaderboardInviteEligible({ week: "current", hasSpot: true }), true);
    assert.equal(leaderboardInviteEligible({ week: "previous", hasSpot: true }), false);
    assert.equal(leaderboardInviteEligible({ week: "current", hasSpot: false }), false);
  });
});

describe("once a week", () => {
  it("keys by moment and account", () => {
    assert.equal(inviteMomentKey("home", "u1"), "slabhold.invite-moment.home.u1");
    assert.notEqual(inviteMomentKey("home", "u1"), inviteMomentKey("leaderboard", "u1"));
  });

  it("shows the first time, and stays up for the rest of that visit", () => {
    const store = memoryStore();
    assert.equal(shouldShowInviteMoment(store, "home", "u1", T0), true);
    markInviteMomentShown(store, "home", "u1", T0);
    assert.equal(shouldShowInviteMoment(store, "home", "u1", T0 + INVITE_MOMENT_VISIT_MS - 1), true);
  });

  it("stays hidden for the rest of the week, then comes back", () => {
    const store = memoryStore();
    markInviteMomentShown(store, "home", "u1", T0);
    assert.equal(shouldShowInviteMoment(store, "home", "u1", T0 + INVITE_MOMENT_VISIT_MS), false);
    assert.equal(shouldShowInviteMoment(store, "home", "u1", T0 + 6 * DAY), false);
    assert.equal(shouldShowInviteMoment(store, "home", "u1", T0 + INVITE_MOMENT_WEEK_MS), true);
  });

  it("does not push the week back when shown again in the same visit", () => {
    const store = memoryStore();
    markInviteMomentShown(store, "home", "u1", T0);
    markInviteMomentShown(store, "home", "u1", T0 + 60_000);
    assert.equal(readInviteMoment(store, "home", "u1")?.shownAt, T0);
  });

  it("hides at once on dismiss, for a week", () => {
    const store = memoryStore();
    markInviteMomentShown(store, "added", "u1", T0);
    dismissInviteMoment(store, "added", "u1", T0 + 1000);
    assert.equal(shouldShowInviteMoment(store, "added", "u1", T0 + 2000), false);
    assert.equal(shouldShowInviteMoment(store, "added", "u1", T0 + 5 * DAY), false);
    assert.equal(shouldShowInviteMoment(store, "added", "u1", T0 + 1000 + INVITE_MOMENT_WEEK_MS), true);
  });

  it("caps each moment on its own, and each account on its own", () => {
    const store = memoryStore();
    markInviteMomentShown(store, "home", "u1", T0);
    assert.equal(shouldShowInviteMoment(store, "home", "u1", T0 + DAY), false);
    assert.equal(shouldShowInviteMoment(store, "leaderboard", "u1", T0 + DAY), true);
    assert.equal(shouldShowInviteMoment(store, "home", "u2", T0 + DAY), true);
  });

  it("reads junk or a clock from the future as never shown, and blocked storage as hidden", () => {
    const store = memoryStore();
    store.setItem(inviteMomentKey("home", "u1"), "{nope");
    assert.equal(shouldShowInviteMoment(store, "home", "u1", T0), true);
    store.setItem(inviteMomentKey("home", "u1"), JSON.stringify({ shownAt: T0 + 30 * DAY }));
    assert.equal(shouldShowInviteMoment(store, "home", "u1", T0), true);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    assert.equal(shouldShowInviteMoment(blocked, "home", "u1", T0), false);
    assert.doesNotThrow(() => markInviteMomentShown(blocked, "home", "u1", T0));
    assert.doesNotThrow(() => dismissInviteMoment(blocked, "home", "u1", T0));
    assert.equal(shouldShowInviteMoment(null, "home", "u1", T0), false);
  });

  it("never shows without an account", () => {
    assert.equal(shouldShowInviteMoment(memoryStore(), "home", "", T0), false);
  });
});
