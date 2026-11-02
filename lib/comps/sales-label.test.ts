import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import * as shared from "./shared-value";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("basedOnSalesLabel has one home", () => {
  it("lives in an import-free module, so the card page shell can use it", () => {
    assert.ok(existsSync(join(process.cwd(), "lib/comps/sales-label.ts")));
    assert.doesNotMatch(read("lib/comps/sales-label.ts"), /^\s*import\b|\bimport\s*\(|\brequire\s*\(/m);
  });

  it("is not copied into comp-basis.tsx, which imports it from sales-label", () => {
    const basis = read("components/comp-basis.tsx");
    assert.doesNotMatch(basis, /function basedOnSalesLabel/);
    assert.match(basis, /import \{ basedOnSalesLabel \} from "@\/lib\/comps\/sales-label";/);
    assert.doesNotMatch(basis, /import (?!type )[^;]*from "@\/lib\/comps\/shared-value"/);
  });

  it("reads 1 sale and 12 sales, and shared-value still exports it", async () => {
    const { basedOnSalesLabel } = await import("./sales-label");
    assert.equal(basedOnSalesLabel(1), "Based on 1 sale");
    assert.equal(basedOnSalesLabel(12), "Based on 12 sales");
    assert.equal(shared.basedOnSalesLabel, basedOnSalesLabel);
  });
});
