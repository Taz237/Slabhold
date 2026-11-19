import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Collection header actions: the sheets load after the first screen", () => {
  const actions = read("components/collection-actions.tsx");

  it("imports neither sheet's contents up front", () => {
    const imports = actions.split("\n").filter((line) => /^import /.test(line)).join("\n");
    assert.doesNotMatch(imports, /share-collection-card|leaderboard-opt-in|collection-sheet|share-sheet/);
    // The trophy's dot is all the first screen needs of the leaderboard.
    assert.match(imports, /useLeaderboardNudge.*leaderboard-nudge/);
    assert.doesNotMatch(read("components/leaderboard-nudge.ts"), /leaderboard-opt-in"|setLeaderboardOptIn/);
  });

  it("loads each sheet as its own lazy part, with the sheet's Try again when the chunk fails", () => {
    for (const view of ["collection-share-sheet-view", "collection-leaderboard-sheet-view"]) {
      const part = new RegExp(
        `lazyPart\\(\\s*\\(\\) => import\\("@/components/${view}"\\)[\\s\\S]*?failed: SheetLoadFailed`,
      );
      assert.match(actions, part, view);
    }
    assert.match(actions, /afterFirstIdle\(ShareSheet\.warm\)/);
    assert.match(actions, /afterFirstIdle\(LeaderboardSheet\.warm\)/);
  });

  it("no longer ships the unused leaderboard prompt", () => {
    assert.doesNotMatch(read("components/leaderboard-opt-in.tsx"), /LeaderboardPrompt/);
  });
});
