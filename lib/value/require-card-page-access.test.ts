import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { cardPageAccessDecision } from "./card-page-access";

const CARD = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";

describe("cardPageAccessDecision", () => {
  it("not-founds a non-owned or private card before comps/value work", () => {
    assert.equal(
      cardPageAccessDecision({ cardId: CARD, userId: "viewer", owned: false }),
      "notFound",
    );
  });

  it("allows the owner and skips local or logged-out sessions", () => {
    assert.equal(
      cardPageAccessDecision({ cardId: CARD, userId: "owner", owned: true }),
      "allow",
    );
    assert.equal(
      cardPageAccessDecision({ cardId: "local-1", userId: "owner", owned: false }),
      "skip",
    );
    assert.equal(
      cardPageAccessDecision({ cardId: CARD, userId: null, owned: false }),
      "skip",
    );
  });

  it("page calls requireCardPageAccess before rendering CardDetail", () => {
    const page = readFileSync(join(process.cwd(), "app/cards/[id]/page.tsx"), "utf8");
    assert.match(page, /await requireCardPageAccess\(id\)/);
    const requireAt = page.indexOf("requireCardPageAccess");
    const detailAt = page.indexOf("<CardDetail");
    assert.ok(requireAt > 0 && detailAt > requireAt);
  });
});
