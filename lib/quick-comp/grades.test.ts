import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GRADE_COMPANIES } from "@/lib/card-options";
import { DEFAULT_QUICK_GRADE, OTHER_COMPANIES, QUICK_GRADES, otherGradeParts } from "./grades";

describe("quick comp grades", () => {
  it("lists the presets in order with PSA 10 as the default", () => {
    assert.deepEqual([...QUICK_GRADES], ["Raw", "PSA 10", "PSA 9", "BGS 9.5", "SGC 10"]);
    assert.equal(DEFAULT_QUICK_GRADE, "PSA 10");
  });

  it("keeps Other's companies in step with GRADE_COMPANIES", () => {
    assert.deepEqual([...OTHER_COMPANIES], GRADE_COMPANIES.filter((company) => company !== "Other"));
  });

  it("splits a grade into the Other selects", () => {
    assert.deepEqual(otherGradeParts("CGC 9.5"), { company: "CGC", number: "9.5" });
    assert.deepEqual(otherGradeParts("Raw"), { company: "PSA", number: "10" });
  });
});
