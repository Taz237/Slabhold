import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASKED_MOMENTS_KEY,
  ASKED_VERSIONS_KEY,
  LAUNCHES_KEY,
  claimReviewAsk,
  countLaunch,
  parseList,
  shouldAskForReview,
} from "@/lib/ios/review-prompt";

function memory(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const blocked: Pick<Storage, "getItem" | "setItem"> = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("SecurityError");
  },
};

const base = { moment: "third-card" as const, launches: 2, askedVersions: [], askedMoments: [], version: "1.0.1" };

describe("review prompt rules", () => {
  it("never asks on the first launch", () => {
    assert.equal(shouldAskForReview({ ...base, launches: 0 }), false);
    assert.equal(shouldAskForReview({ ...base, launches: 1 }), false);
    assert.equal(shouldAskForReview({ ...base, launches: 2 }), true);
  });

  it("asks at most once per app version, and again on a new version", () => {
    assert.equal(shouldAskForReview({ ...base, askedVersions: ["1.0.1"] }), false);
    assert.equal(shouldAskForReview({ ...base, moment: "first-quick-comp", askedVersions: ["1.0.1"], version: "1.0.2" }), true);
  });

  it("asks for each moment only once ever", () => {
    assert.equal(shouldAskForReview({ ...base, askedMoments: ["third-card"], version: "1.0.2" }), false);
    assert.equal(shouldAskForReview({ ...base, moment: "first-quick-comp", askedMoments: ["third-card"] }), true);
  });

  it("doesn't ask when storage is blocked or the version is unknown", () => {
    assert.equal(shouldAskForReview({ ...base, launches: null }), false);
    assert.equal(shouldAskForReview({ ...base, askedVersions: null }), false);
    assert.equal(shouldAskForReview({ ...base, askedMoments: null }), false);
    assert.equal(shouldAskForReview({ ...base, version: null }), false);
    assert.equal(shouldAskForReview({ ...base, version: "" }), false);
  });
});

describe("review prompt storage", () => {
  it("counts each app session once, not each reload", () => {
    const local = memory();
    assert.equal(countLaunch(local, memory()), 1);
    const session = memory();
    assert.equal(countLaunch(local, session), 2);
    assert.equal(countLaunch(local, session), 2, "a reload in the same session");
    assert.equal(local.getItem(LAUNCHES_KEY), "2");
    assert.equal(countLaunch(blocked, blocked), null);
  });

  it("first launch → no; 2nd launch → yes once; same version again → no; new version → yes", () => {
    const local = memory();
    countLaunch(local, memory());
    assert.equal(claimReviewAsk(local, "third-card", "1.0.1"), false, "first launch");
    countLaunch(local, memory());
    assert.equal(claimReviewAsk(local, "third-card", "1.0.1"), true, "second launch");
    assert.deepEqual(parseList(local.getItem(ASKED_VERSIONS_KEY)), ["1.0.1"], "recorded before asking");
    assert.deepEqual(parseList(local.getItem(ASKED_MOMENTS_KEY)), ["third-card"]);
    assert.equal(claimReviewAsk(local, "first-quick-comp", "1.0.1"), false, "same version");
    assert.equal(claimReviewAsk(local, "third-card", "1.0.2"), false, "moment already used");
    assert.equal(claimReviewAsk(local, "first-quick-comp", "1.0.2"), true, "new version, new moment");
    assert.equal(claimReviewAsk(local, "first-quick-comp", "1.0.3"), false, "each moment once ever");
  });

  it("doesn't ask when storage is blocked", () => {
    assert.equal(claimReviewAsk(blocked, "third-card", "1.0.1"), false);
  });

  it("reads junk stored values as empty", () => {
    assert.deepEqual(parseList("{"), []);
    assert.deepEqual(parseList('{"a":1}'), []);
    assert.deepEqual(parseList('["1.0.1", 2]'), ["1.0.1"]);
  });
});
