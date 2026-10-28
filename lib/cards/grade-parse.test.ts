import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { isStaticPublicPath } from "@/lib/auth/route-access";
import {
  GRADE_NUMBERS,
  gradeSelectOptions,
  knownGradingCompanies,
  parseGrade,
  resolveGradingCompany,
} from "@/lib/card-options";
import {
  applyGradingCompany,
  gradeNumberFromGrade,
  gradingCompanyFromCard,
  gradingCompanyOptions,
  isRawGradingCompany,
} from "./grading-company";

function read(path: string) {
  return readFileSync(join(process.cwd(), path));
}

/** Grader column and numeric grade the add/edit save stores for a typed string. */
function savedGrade(input: string): { grader: string | null; grade: string } {
  const text = input.trim();
  const parsed = parseGrade(text);
  const raw = !text || parsed.company === "Raw" || isRawGradingCompany(parsed.company);
  if (raw) return { grader: null, grade: "Raw" };
  const company = gradingCompanyFromCard({ grade: text, conditionType: "graded" });
  const number = gradeNumberFromGrade(text);
  const applied = applyGradingCompany({ company, gradeNumber: number });
  return {
    grader: applied.grader,
    grade: number || applied.grade,
  };
}

describe("grade string parsing", () => {
  it("uses the companies already named by the select and the comps matcher", () => {
    assert.deepEqual(knownGradingCompanies(), [
      "PSA",
      "BGS",
      "SGC",
      "CGC",
      "TAG",
      "Other",
      "HGA",
      "CSG",
      "ISA",
    ]);
    assert.equal(resolveGradingCompany("bvg"), "BGS");
    assert.equal(resolveGradingCompany("Gem Studios"), "");
    assert.equal(resolveGradingCompany("Studios"), "");
  });

  it("maps each pasted grade string onto a known company and a number", () => {
    assert.deepEqual(savedGrade("PSA 10"), { grader: "PSA", grade: "10" });
    assert.deepEqual(savedGrade("psa10"), { grader: "PSA", grade: "10" });
    assert.deepEqual(savedGrade("Beckett 9.5"), { grader: "BGS", grade: "9.5" });
    assert.deepEqual(savedGrade("BGS 9.5"), { grader: "BGS", grade: "9.5" });
    assert.deepEqual(savedGrade("CGC 9.8"), { grader: "CGC", grade: "9.8" });
    assert.deepEqual(savedGrade("SGC 9"), { grader: "SGC", grade: "9" });
    assert.deepEqual(savedGrade("Mint 9"), { grader: null, grade: "9" });
    assert.deepEqual(savedGrade("Gem Mint 10"), { grader: null, grade: "10" });
    assert.deepEqual(savedGrade("Raw"), { grader: null, grade: "Raw" });
    assert.deepEqual(savedGrade(""), { grader: null, grade: "Raw" });
    assert.deepEqual(savedGrade("HGA 9.5"), { grader: "HGA", grade: "9.5" });
    assert.deepEqual(parseGrade("Beckett"), {
      company: "BGS",
      number: "",
      recognized: true,
    });
    assert.equal(savedGrade("Beckett").grader, "BGS");
    assert.equal(savedGrade("bvg 8").grader, "BGS");
    assert.equal(savedGrade("bvg 8").grade, "8");

    for (const text of ["Mint", "Gem", "GEM MT", "NM-MT", "GEM MT 10", "NM-MT 8"]) {
      assert.equal(gradingCompanyFromCard({ grade: text, conditionType: "graded" }), "", text);
    }
    assert.equal(savedGrade("GEM MT 10").grade, "10");
    assert.equal(savedGrade("NM-MT 8").grade, "8");
  });

  it("keeps a listed company on edit and still requires one when none was parsed", () => {
    assert.equal(
      gradingCompanyFromCard({ grade: "HGA 9", conditionType: "graded" }),
      "HGA",
    );
    assert.equal(gradingCompanyOptions("HGA")[0], "HGA");
    assert.equal(
      gradingCompanyFromCard({ grade: "10", conditionType: "graded" }),
      "",
    );
    assert.equal(
      gradingCompanyFromCard({ grade: "Gem Mint 10", conditionType: "graded" }),
      "",
    );
    const missing = applyGradingCompany({ company: "", gradeNumber: "10" });
    assert.equal(missing.grader, null);
    assert.notEqual(missing.conditionType, "raw");
    assert.equal(
      gradingCompanyFromCard({ grade: "PSA 10", grader: "HGA", conditionType: "graded" }),
      "HGA",
    );
  });
});

describe("grade select display", () => {
  it("adds a saved grade the scale does not list and leaves the scale untouched", () => {
    assert.equal(GRADE_NUMBERS.CGC.includes("9.8"), false);
    assert.equal(GRADE_NUMBERS.PSA.includes("9.5"), false);
    const cgc = gradeSelectOptions("CGC", "9.8");
    assert.equal(cgc[0], "9.8");
    assert.equal(cgc.includes("10"), true);
    assert.equal(cgc.includes("9.5"), true);
    assert.equal(cgc.filter((option) => option === "9.8").length, 1);
    assert.equal(GRADE_NUMBERS.CGC.includes("9.8"), false);

    const psaHalf = gradeSelectOptions("PSA", "9.5");
    assert.equal(psaHalf[0], "9.5");
    assert.equal(psaHalf.filter((option) => option === "9.5").length, 1);
    assert.equal(GRADE_NUMBERS.PSA.includes("9.5"), false);

    const psaTen = gradeSelectOptions("PSA", "10");
    assert.equal(psaTen.filter((option) => option === "10").length, 1);
    assert.equal(psaTen[0], "10");
    assert.deepEqual(gradeSelectOptions("BGS", ""), GRADE_NUMBERS.BGS);

    const form = read("components/card-form.tsx").toString("utf8");
    assert.match(form, /gradeSelectOptions\(gradeCompany, gradeNumber\)/);
    assert.match(read("lib/cards/new-card-draft.ts").toString("utf8"), /Boolean\(input\.gradeNumber\)/);
  });
});

describe("favicon", () => {
  it("serves the brand icon at /favicon.ico and the gate already allows it", () => {
    assert.equal(isStaticPublicPath("/favicon.ico"), true);
    const ico = read("app/favicon.ico");
    const png = read("public/icons/icon-192.png");
    assert.equal(ico.readUInt16LE(0), 0);
    assert.equal(ico.readUInt16LE(2), 1);
    assert.equal(ico.readUInt16LE(4), 1);
    assert.ok(ico.includes(png));
    const layout = read("app/layout.tsx").toString("utf8");
    assert.doesNotMatch(layout, /favicon\.ico/);
    assert.match(layout, /\/apple-touch-icon\.png/);
  });
});
