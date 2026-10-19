import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { screenValueFromComps } from "./shared-value";
import {
  compFlagStatus,
  parseFlagReason,
  showHiddenSales,
} from "./flag-reasons";
import { adminAccess } from "@/lib/safety/admin";
import type { CompListing } from "@/lib/types";

function sale(itemId: string, price: number): CompListing {
  return {
    id: itemId,
    itemId,
    title: `Sale ${itemId}`,
    soldPrice: price,
    soldDate: "2026-10-18",
    platform: "eBay",
    condition: "PSA 10",
    shipping: null,
    url: `https://example.com/${itemId}`,
  };
}

const SALES = [sale("a", 100), sale("b", 200), sale("c", 300), sale("d", 400)];

describe("comp flag reason", () => {
  it("requires one of the known reasons", () => {
    assert.equal(parseFlagReason(""), null);
    assert.equal(parseFlagReason("   "), null);
    assert.equal(parseFlagReason("not-a-reason"), null);
    assert.equal(parseFlagReason(null), null);
    assert.equal(parseFlagReason("wrong_set"), "wrong_set");
    assert.equal(parseFlagReason("lot"), "lot");
  });

  it("adds the reason check and an owner delete policy", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261019210000_comp_flags_reason.sql"),
      "utf8",
    );
    assert.match(sql, /add column if not exists reason text/i);
    assert.match(sql, /wrong_set/);
    assert.match(sql, /wrong_parallel/);
    assert.match(sql, /wrong_grade/);
    assert.match(sql, /wrong_card/);
    assert.match(sql, /'lot'/);
    assert.match(sql, /for delete/i);
    assert.match(sql, /auth\.uid\(\) = user_id/);
    assert.doesNotMatch(sql, /update public\.comp_flags/i);
  });
});

describe("flag then undo", () => {
  it("returns the identical median and N", () => {
    const before = screenValueFromComps(SALES);
    const flagged = screenValueFromComps(SALES, new Set(["b"]));
    assert.notEqual(flagged.count, before.count);
    assert.notEqual(flagged.median, before.median);
    const restored = screenValueFromComps(SALES, new Set());
    assert.equal(restored.median, before.median);
    assert.equal(restored.count, before.count);
    assert.equal(restored.low, before.low);
    assert.equal(restored.high, before.high);
  });

  it("restore from the hidden list recomputes the same way", () => {
    const hidden = new Set(["a", "d"]);
    const flagged = screenValueFromComps(SALES, hidden);
    const afterRestore = screenValueFromComps(SALES, new Set(["a"]));
    assert.equal(afterRestore.count, flagged.count + 1);
    const allBack = screenValueFromComps(SALES, new Set());
    assert.equal(allBack.count, SALES.length);
    assert.equal(allBack.median, screenValueFromComps(SALES).median);
  });
});

describe("comp flag access", () => {
  it("non-owners cannot see hidden sales or flag", () => {
    assert.equal(compFlagStatus({ userId: null, ownerId: "owner" }), 401);
    assert.equal(compFlagStatus({ userId: "viewer", ownerId: "owner" }), 403);
    assert.equal(compFlagStatus({ userId: "owner", ownerId: "owner" }), 200);
    assert.equal(showHiddenSales(false, 3), false);
    assert.equal(showHiddenSales(true, 0), false);
    assert.equal(showHiddenSales(true, 1), true);
  });

  it("admin restore requires an admin", () => {
    assert.equal(adminAccess("user", "admin-1"), "notFound");
    assert.equal(adminAccess(null, "admin-1"), "notFound");
    assert.equal(adminAccess("admin-1", "admin-1, admin-2"), "allow");
  });
});
