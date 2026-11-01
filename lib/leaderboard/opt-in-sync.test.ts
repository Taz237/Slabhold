import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publishLeaderboardOptIn, subscribeLeaderboardOptIn } from "@/lib/leaderboard/opt-in-sync";

describe("leaderboard opt-in sync", () => {
  it("reaches subscribers for that user only, until they unsubscribe", () => {
    const ada: boolean[] = [];
    const bo: boolean[] = [];
    const stopAda = subscribeLeaderboardOptIn("ada", (optedIn) => ada.push(optedIn));
    const stopBo = subscribeLeaderboardOptIn("bo", (optedIn) => bo.push(optedIn));
    publishLeaderboardOptIn({ userId: "ada", optedIn: true });
    assert.deepEqual(ada, [true]);
    assert.deepEqual(bo, []);
    stopAda();
    publishLeaderboardOptIn({ userId: "ada", optedIn: false });
    assert.deepEqual(ada, [true]);
    publishLeaderboardOptIn({ userId: "bo", optedIn: false });
    assert.deepEqual(bo, [false]);
    stopBo();
  });

  it("lets a listener unsubscribe while a publish is running", () => {
    const seen: string[] = [];
    const stop = subscribeLeaderboardOptIn("ada", () => {
      seen.push("first");
      stop();
    });
    const stopSecond = subscribeLeaderboardOptIn("ada", () => seen.push("second"));
    publishLeaderboardOptIn({ userId: "ada", optedIn: true });
    publishLeaderboardOptIn({ userId: "ada", optedIn: true });
    assert.deepEqual(seen, ["first", "second", "second"]);
    stopSecond();
  });
});
