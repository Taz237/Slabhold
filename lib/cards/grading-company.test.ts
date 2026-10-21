import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGrade } from "@/lib/card-options";
import { mapCardRow, saveUserCard, type CardRow } from "@/lib/social/cards";
import type { SportsCard } from "@/lib/types";
import {
  GRADING_COMPANIES,
  RAW_GRADING_COMPANY,
  applyGradingCompany,
  gradeDetailSpecs,
  gradeNumberFromGrade,
  gradingCompanyFromCard,
  gradingCompanyOptions,
} from "./grading-company";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function sample(partial: Partial<SportsCard> = {}): SportsCard {
  return {
    id: "card-1",
    playerName: "Victor Wembanyama",
    year: 2024,
    yearLabel: "2024",
    setBrand: "Prizm",
    setIsCustom: false,
    cardNumber: "136",
    noNumber: false,
    grade: "Raw",
    parallel: "Base",
    parallelIsCustom: false,
    serialRun: null,
    serialNo: null,
    isRookie: false,
    isAuto: false,
    isRelic: false,
    conditionType: "raw",
    gradeQualifier: "",
    certNumber: "",
    sport: "Basketball",
    purchasePrice: null,
    purchaseDate: "",
    estimatedSellPrice: 0,
    sellPrice: null,
    sellDate: null,
    notes: "",
    photoDataUrl: "data:image/jpeg;base64,YQ==",
    accent: "#7c5cff",
    category: "pc",
    isPublic: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
    ...partial,
  };
}

function client(options?: {
  upsert?: (
    row: Record<string, unknown>,
  ) => Promise<{ error: { message: string; code?: string } | null }>;
}) {
  const rows = new Map<string, Record<string, unknown>>();
  const supabase = {
    storage: {
      from() {
        return {
          upload() {
            return Promise.resolve({ error: null });
          },
          async remove() {
            return { data: [], error: null };
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://cdn.example/${path}` } };
          },
        };
      },
    },
    from() {
      return {
        upsert(row: Record<string, unknown>) {
          const pending = options?.upsert
            ? options.upsert(row)
            : Promise.resolve({ error: null as { message: string; code?: string } | null });
          return pending.then((result) => {
            if (!result.error) rows.set(String(row.id), row);
            return result;
          });
        },
      };
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, rows };
}

function asCardRow(row: Record<string, unknown>): CardRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    player: String(row.player ?? ""),
    year: Number(row.year),
    set: String(row.set ?? ""),
    grade: (row.grade as string | null) ?? null,
    parallel: (row.parallel as string | null) ?? null,
    paid_price: (row.paid_price as number | null) ?? null,
    estimated_value: (row.estimated_value as number | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    card_number: (row.card_number as string | null) ?? null,
    sport: (row.sport as string | null) ?? null,
    purchase_date: (row.purchase_date as string | null) ?? null,
    sell_price: (row.sell_price as number | null) ?? null,
    sell_date: (row.sell_date as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    accent: (row.accent as string | null) ?? null,
    is_public: Boolean(row.is_public),
    category: (row.category as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: (row.updated_at as string | null) ?? null,
    no_number: Boolean(row.no_number),
    year_label: (row.year_label as string | null) ?? null,
    set_name: (row.set_name as string | null) ?? null,
    set_is_custom: Boolean(row.set_is_custom),
    parallel_is_custom: Boolean(row.parallel_is_custom),
    serial_run: (row.serial_run as number | null) ?? null,
    serial_no: (row.serial_no as number | null) ?? null,
    is_rookie: Boolean(row.is_rookie),
    is_auto: Boolean(row.is_auto),
    is_relic: Boolean(row.is_relic),
    condition_type: (row.condition_type as string | null) ?? null,
    grader: (row.grader as string | null) ?? null,
    grade_qualifier: (row.grade_qualifier as string | null) ?? null,
    cert_number: (row.cert_number as string | null) ?? null,
  };
}

async function roundTrip(card: SportsCard) {
  const { supabase, rows } = client();
  await saveUserCard(supabase, "user-1", card, 5_000);
  const stored = rows.get(card.id);
  assert.ok(stored);
  return { card: mapCardRow(asCardRow(stored)), stored };
}

function gradedRow(partial: {
  grade: string;
  grader: string | null;
  id?: string;
}): CardRow {
  return {
    id: partial.id ?? "card-1",
    user_id: "user-1",
    player: "Victor Wembanyama",
    year: 2024,
    set: "Prizm",
    grade: partial.grade,
    parallel: "Base",
    paid_price: null,
    estimated_value: 0,
    image_url: null,
    card_number: "136",
    sport: "Basketball",
    purchase_date: null,
    sell_price: null,
    sell_date: null,
    notes: null,
    accent: "#7c5cff",
    is_public: false,
    category: "pc",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-02T00:00:00.000Z",
    condition_type: "graded",
    grader: partial.grader,
    cert_number: null,
    year_label: "2024",
    set_name: "Prizm",
  };
}

/** Open the edit form for a graded card and leave the grading select untouched. */
function openGraded(partial: { grade: string; grader: string | null }) {
  const loaded = mapCardRow(gradedRow(partial));
  const company = gradingCompanyFromCard({
    grade: loaded.grade,
    conditionType: loaded.conditionType,
  });
  const gradeNumber = gradeNumberFromGrade(loaded.grade);
  const companyMissing = !company.trim();
  return {
    loaded,
    company,
    gradeNumber,
    companyMissing,
    options: gradingCompanyOptions(company),
    canSave: !companyMissing && Boolean(gradeNumber),
  };
}

async function resaveUntouched(opened: ReturnType<typeof openGraded>) {
  assert.equal(opened.canSave, true);
  const applied = applyGradingCompany({
    company: opened.company,
    gradeNumber: opened.gradeNumber,
  });
  return roundTrip({
    ...opened.loaded,
    grade: applied.grade,
    conditionType: applied.conditionType,
  });
}

describe("grading company", () => {
  it("offers Raw / Ungraded, PSA, BGS, SGC, CGC, and Other", () => {
    assert.deepEqual([...GRADING_COMPANIES], [
      "Raw / Ungraded",
      "PSA",
      "BGS",
      "SGC",
      "CGC",
      "Other",
    ]);
    assert.deepEqual(gradingCompanyOptions("PSA"), [...GRADING_COMPANIES]);
    assert.equal(gradingCompanyOptions("TAG")[0], "TAG");
    const form = read("components/card-form.tsx");
    assert.match(form, /label="Grading company"/);
    assert.match(form, /gradingCompanyOptions\(gradeCompany\)/);
    assert.match(form, /gradingCompanyFromCard\(/);
    assert.match(form, /applyGradingCompany\(/);
    assert.match(read("components/card-detail.tsx"), /gradeDetailSpecs\(/);
  });

  it("saves and reloads the grading company on add", async () => {
    const applied = applyGradingCompany({ company: "PSA", gradeNumber: "10" });
    const saved = await roundTrip(
      sample({
        grade: applied.grade,
        conditionType: applied.conditionType,
        certNumber: "555",
      }),
    );
    assert.equal(saved.stored.grader, "PSA");
    assert.equal(saved.stored.grade, "10");
    assert.equal(saved.stored.condition_type, "graded");
    assert.equal(saved.stored.cert_number, "555");
    assert.equal(gradingCompanyFromCard(saved.card), "PSA");
    assert.equal(parseGrade(saved.card.grade).number, "10");
    assert.equal(saved.card.certNumber, "555");
    assert.deepEqual(
      gradeDetailSpecs(saved.card).map((spec) => spec.value),
      ["PSA", "10", "555"],
    );
  });

  it("saves and reloads a grading company change on edit", async () => {
    const added = applyGradingCompany({ company: "PSA", gradeNumber: "10" });
    const first = await roundTrip(
      sample({
        grade: added.grade,
        conditionType: added.conditionType,
        certNumber: "555",
      }),
    );
    assert.equal(gradingCompanyFromCard(first.card), "PSA");
    const edited = applyGradingCompany({ company: "BGS", gradeNumber: "9.5" });
    const second = await roundTrip({
      ...first.card,
      grade: edited.grade,
      conditionType: edited.conditionType,
      certNumber: "777",
    });
    assert.equal(second.stored.grader, "BGS");
    assert.equal(second.stored.grade, "9.5");
    assert.equal(gradingCompanyFromCard(second.card), "BGS");
    assert.equal(parseGrade(second.card.grade).number, "9.5");
    assert.equal(second.card.certNumber, "777");
    assert.deepEqual(
      gradeDetailSpecs(second.card).map((spec) => [spec.label, spec.value]),
      [
        ["Grading company", "BGS"],
        ["Grade", "9.5"],
        ["Cert", "777"],
      ],
    );
  });

  it("reloads Raw / Ungraded and each other company", async () => {
    const raw = applyGradingCompany({
      company: RAW_GRADING_COMPANY,
      gradeNumber: "",
    });
    const rawSaved = await roundTrip(
      sample({ grade: raw.grade, conditionType: raw.conditionType }),
    );
    assert.equal(rawSaved.stored.grader, null);
    assert.equal(rawSaved.stored.grade, "Raw");
    assert.equal(gradingCompanyFromCard(rawSaved.card), RAW_GRADING_COMPANY);
    assert.deepEqual(gradeDetailSpecs(rawSaved.card), [
      { label: "Grading company", value: RAW_GRADING_COMPANY },
    ]);

    for (const company of ["SGC", "CGC", "Other"] as const) {
      const applied = applyGradingCompany({ company, gradeNumber: "10" });
      const saved = await roundTrip(
        sample({
          id: company,
          grade: applied.grade,
          conditionType: applied.conditionType,
        }),
      );
      assert.equal(saved.stored.grader, company);
      assert.equal(gradingCompanyFromCard(saved.card), company);
      assert.equal(parseGrade(saved.card.grade).number, "10");
    }
  });

  it("keeps PSA, BGS, SGC, CGC, TAG, Other, and Raw", () => {
    for (const company of ["PSA", "BGS", "SGC", "CGC", "TAG", "Other"]) {
      const applied = applyGradingCompany({ company, gradeNumber: "10" });
      assert.equal(applied.conditionType, "graded");
      assert.equal(applied.grader, company);
      assert.equal(
        gradingCompanyFromCard({ grade: applied.grade, conditionType: "graded" }),
        company,
      );
      assert.equal(gradeNumberFromGrade(applied.grade), "10");
      assert.equal(gradingCompanyOptions(company).includes(company), true);
    }
    const raw = applyGradingCompany({ company: RAW_GRADING_COMPANY, gradeNumber: "10" });
    assert.equal(raw.conditionType, "raw");
    assert.equal(raw.grade, "Raw");
    assert.equal(raw.grader, null);
    assert.equal(
      gradingCompanyFromCard({ grade: "Raw", conditionType: "raw" }),
      RAW_GRADING_COMPANY,
    );
  });

  it("re-saves graded HGA 9, 10, and Gem Mint 10 without turning them raw", async () => {
    const form = read("components/card-form.tsx");
    assert.match(form, /Choose a grading company/);
    assert.match(form, /gradeNumberFromGrade\(/);
    assert.match(form, /companyMissing/);

    const hgaText = await openGraded({ grade: "HGA 9", grader: null });
    assert.equal(hgaText.company, "HGA");
    assert.equal(hgaText.gradeNumber, "9");
    assert.equal(hgaText.options[0], "HGA");
    const hgaSaved = await resaveUntouched(hgaText);
    assert.equal(hgaSaved.stored.condition_type, "graded");
    assert.equal(hgaSaved.stored.grader, "HGA");
    assert.equal(hgaSaved.stored.grade, "9");
    assert.equal(gradingCompanyFromCard(hgaSaved.card), "HGA");
    assert.equal(gradeNumberFromGrade(hgaSaved.card.grade), "9");
    assert.notEqual(hgaSaved.card.conditionType, "raw");

    const hgaColumn = await openGraded({ grade: "9", grader: "HGA" });
    assert.equal(hgaColumn.company, "HGA");
    assert.equal(hgaColumn.gradeNumber, "9");
    const hgaColumnSaved = await resaveUntouched(hgaColumn);
    assert.equal(hgaColumnSaved.stored.grader, "HGA");
    assert.equal(gradeNumberFromGrade(hgaColumnSaved.card.grade), "9");
    assert.equal(hgaColumnSaved.card.conditionType, "graded");

    for (const grade of ["10", "Gem Mint 10"]) {
      const opened = await openGraded({ grade, grader: null });
      assert.equal(opened.company, "");
      assert.equal(opened.gradeNumber, "10");
      assert.equal(opened.companyMissing, true);
      const attempted = applyGradingCompany({
        company: opened.company,
        gradeNumber: opened.gradeNumber,
      });
      assert.notEqual(attempted.conditionType, "raw");
      assert.notEqual(attempted.grade, "Raw");
      assert.match(attempted.grade, /10/);
      assert.equal(opened.canSave, false);
    }
  });

  it("still saves when the grader column is missing", async () => {
    let calls = 0;
    const { supabase, rows } = client({
      upsert: async (row) => {
        calls += 1;
        if (calls === 1 && "grader" in row) {
          return {
            error: {
              message: "Could not find the 'grader' column of 'cards' in the schema cache",
              code: "PGRST204",
            },
          };
        }
        return { error: null };
      },
    });
    const applied = applyGradingCompany({ company: "CGC", gradeNumber: "9" });
    await saveUserCard(
      supabase,
      "user-1",
      sample({ grade: applied.grade, conditionType: applied.conditionType }),
      5_000,
    );
    assert.equal(rows.size, 1);
    assert.equal(calls >= 2, true);
  });
});
