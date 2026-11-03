import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitQueryGrade } from "./grades";

const cases: [input: string, grade: string | null, rest?: string][] = [
  ["lebron 2003 topps chrome 111 psa 9", "PSA 9", "lebron 2003 topps chrome 111"],
  ["BGS 9.5 luka prizm", "BGS 9.5", "luka prizm"],
  ["bgs9.5", "BGS 9.5", ""],
  ["beckett 9.5", "BGS 9.5", ""],
  ["sgc 10", "SGC 10", ""],
  ["psa-10", "PSA 10", ""],
  ["cgc 8.5", "CGC 8.5", ""],
  ["tag 10", "TAG 10", ""],
  ["wemby raw", "Raw", "wemby"],
  ["ungraded", "Raw", ""],
  ["psa 10 psa 9", "PSA 9", ""],
  ["luka PSA 10.0 prizm", "PSA 10", "luka prizm"],
  ["bgs 9.50", "BGS 9.5", ""],
  ["psa 9.5", null],
  ["psa", null, "psa"],
  ["psa 11", null, "psa 11"],
  ["rawlings", null, "rawlings"],
  ["tagliabue", null, "tagliabue"],
  ["#10 luka", null, "#10 luka"],
  ["luka #10", null, "luka #10"],
  ["", null, ""],
];

describe("splitQueryGrade", () => {
  for (const [input, grade, rest] of cases) {
    it(`${JSON.stringify(input)} → ${grade ?? "no grade"}`, () => {
      const split = splitQueryGrade(input);
      assert.equal(split.grade, grade);
      if (rest !== undefined) assert.equal(split.rest, rest);
    });
  }
});
