import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { publicCardHiddenFromViewer } from "./public-card-visibility";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

describe("public card block filter", () => {
  it("hides a server-fetched card from a blocked viewer once the snapshot is ready", () => {
    assert.equal(
      publicCardHiddenFromViewer({
        ready: true,
        profileId: ALICE,
        blockedIds: [ALICE],
        hiddenAuthorIds: [],
      }),
      true,
    );
    assert.equal(
      publicCardHiddenFromViewer({
        ready: true,
        profileId: ALICE,
        blockedIds: [],
        hiddenAuthorIds: [ALICE],
      }),
      true,
    );
    assert.equal(
      publicCardHiddenFromViewer({
        ready: false,
        profileId: ALICE,
        blockedIds: [ALICE],
        hiddenAuthorIds: [ALICE],
      }),
      false,
    );
    assert.equal(
      publicCardHiddenFromViewer({
        ready: true,
        profileId: BOB,
        blockedIds: [ALICE],
        hiddenAuthorIds: [ALICE],
      }),
      false,
    );
    assert.equal(
      publicCardHiddenFromViewer({
        ready: true,
        profileId: null,
        blockedIds: [ALICE],
        hiddenAuthorIds: [],
      }),
      false,
    );

    const view = readFileSync(
      join(process.cwd(), "components/public-card-view.tsx"),
      "utf8",
    );
    const gate = view.indexOf("publicCardHiddenFromViewer");
    const serverCard = view.indexOf("serverCard ??");
    assert.ok(gate > 0 && gate < serverCard);
    assert.match(view, /title="Profile not found"/);
    assert.match(view, /hidden \? undefined : \(serverProfile \?\? snapshotProfile\)/);
  });
});
