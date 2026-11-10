import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADD_LAST_USED_PREFIX,
  lastUsedFromSave,
  readAddLastUsed,
  writeAddLastUsed,
} from "@/lib/cards/add-last-used";
import { RAW_GRADING_COMPANY } from "@/lib/cards/grading-company";

function memoryStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
  };
}

describe("last-used Add card answers", () => {
  it("round-trips sport, year, set and grader per user", () => {
    const store = memoryStorage();
    writeAddLastUsed(store, "user-1", { sport: "Baseball", year: "2024", set: "Topps Chrome", grader: "PSA" });
    assert.deepEqual(readAddLastUsed(store, "user-1"), {
      sport: "Baseball",
      year: "2024",
      set: "Topps Chrome",
      grader: "PSA",
    });
    assert.equal(readAddLastUsed(store, "user-2"), null, "another user sees nothing");
    assert.ok(store.data.has(`${ADD_LAST_USED_PREFIX}user-1`));
  });

  it("needs a user: signed out reads and writes nothing", () => {
    const store = memoryStorage();
    writeAddLastUsed(store, null, { sport: "Baseball", year: "2024", set: "Topps Chrome", grader: "" });
    assert.equal(store.data.size, 0);
    assert.equal(readAddLastUsed(store, null), null);
  });

  it("survives missing, broken or throwing storage", () => {
    assert.equal(readAddLastUsed(null, "user-1"), null);
    const store = memoryStorage();
    store.setItem(`${ADD_LAST_USED_PREFIX}user-1`, "{not json");
    assert.equal(readAddLastUsed(store, "user-1"), null);
    store.setItem(`${ADD_LAST_USED_PREFIX}user-1`, JSON.stringify({ sport: 4, year: ["x"], set: null }));
    assert.deepEqual(readAddLastUsed(store, "user-1"), { sport: "", year: "", set: "", grader: "" });
    const throwing = {
      ...memoryStorage(),
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    assert.equal(readAddLastUsed(throwing, "user-1"), null);
    assert.doesNotThrow(() =>
      writeAddLastUsed(throwing, "user-1", { sport: "Hockey", year: "2024-25", set: "Upper Deck", grader: "" }),
    );
  });

  it("keeps the grader only for a graded card; raw stores no grader", () => {
    assert.deepEqual(
      lastUsedFromSave({ sport: "Football", yearLabel: "2024", setBrand: "Panini Prizm", gradeCompany: "PSA", conditionType: "graded" }),
      { sport: "Football", year: "2024", set: "Panini Prizm", grader: "PSA" },
    );
    assert.equal(
      lastUsedFromSave({ sport: "Football", yearLabel: "2024", setBrand: "Panini Prizm", gradeCompany: RAW_GRADING_COMPANY, conditionType: "raw" }).grader,
      "",
    );
    assert.equal(
      lastUsedFromSave({ sport: "Football", yearLabel: "2024", setBrand: "Panini Prizm", gradeCompany: "Not a grader", conditionType: "graded" }).grader,
      "",
      "only a Condition chip grader is remembered",
    );
  });
});
