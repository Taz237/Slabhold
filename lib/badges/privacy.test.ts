import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SOCIAL_PROFILE_COLUMNS } from "@/lib/social/remote";
import type { EarnedBadge } from "./progress";
import { profileBadges } from "./visibility";

const earned: EarnedBadge[] = [
  { category: "collector", tier: "gold" },
  { category: "streak", tier: "bronze" },
];

const hidden = {
  username: "quiet",
  ownerId: "owner",
  showBadges: false,
  earned,
  pinned: ["collector:gold"],
  firstGoal: null,
};

describe("badges off", () => {
  it("sends no pins or badges to anyone else", () => {
    for (const viewerId of ["someone", null]) {
      const payload = profileBadges({ ...hidden, viewerId });
      assert.deepEqual(payload, { username: "quiet", view: { kind: "hidden" }, earned: [] });
      assert.doesNotMatch(JSON.stringify(payload), /collector|streak|pinned/);
    }
  });

  it("still sends the owner their own badges", () => {
    const payload = profileBadges({ ...hidden, viewerId: "owner" });
    assert.deepEqual(payload.view, { kind: "hidden" });
    assert.equal(payload.earned.length, 2);
  });

  it("shows pins to others when badges are on", () => {
    const payload = profileBadges({ ...hidden, showBadges: true, viewerId: "someone" });
    assert.equal(payload.view.kind, "strip");
    assert.equal(payload.earned.length, 2);
  });

  it("never reads badge columns into the social profile list", () => {
    assert.doesNotMatch(SOCIAL_PROFILE_COLUMNS, /\*|pinned_badges|show_badges/);
  });

  it("never selects every profile column, so pinned_badges can't leak", () => {
    const root = process.cwd();
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        const source = readFileSync(path, "utf8");
        if (/from\(\s*"profiles"\s*\)\s*\.select\(\s*"\*"/.test(source)) offenders.push(path.slice(root.length + 1));
      }
    };
    for (const dir of ["app", "components", "lib"]) walk(join(root, dir));
    assert.deepEqual(offenders, []);
  });
});
