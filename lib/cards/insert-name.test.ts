import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { yearSetLine } from "@/lib/collection/grid";
import { cardTitle } from "@/lib/format";
import { mapCardRow, saveUserCard, type CardRow } from "@/lib/social/cards";
import { insertNameForSave, parseScanHandoff, scanCardStart, scanHandoffFrom } from "@/lib/scan/handoff";
import type { ScanMatch } from "@/lib/scan/match";
import { PREVIEW_ROOKIE_CODE } from "@/lib/scan/preview-fixtures";
import { cardInputFromScan } from "@/lib/scan/quick-add";
import type { SportsCard } from "@/lib/types";
import { insertNameOf, insertSpec } from "./insert-name";
import { loadCollection, saveCollection } from "@/lib/storage";

/**
 * The insert a scanned card is in ("Rookie Code" for the 2026-27 Topps RC-3) is saved with it, in
 * cards.insert_name, and shown with its set. Until that column is added (the migration is
 * unapplied), every card still saves with all its other details.
 */

const ROOKIE_CODE: ScanMatch = { ...PREVIEW_ROOKIE_CODE[0], parallel: "Base", sureness: { ...PREVIEW_ROOKIE_CODE[0].sureness, parallel: "sure" } };

function card(partial: Partial<SportsCard> = {}): SportsCard {
  return {
    id: "card-rc3",
    playerName: "Cameron Boozer",
    year: 2026,
    yearLabel: "2026-27",
    setBrand: "Topps",
    setIsCustom: false,
    cardNumber: "RC-3",
    noNumber: false,
    grade: "Raw",
    parallel: "Base",
    parallelIsCustom: false,
    serialRun: null,
    serialNo: null,
    isRookie: true,
    isAuto: false,
    isRelic: false,
    conditionType: "raw",
    gradeQualifier: "",
    certNumber: "",
    sport: "Basketball",
    purchasePrice: null,
    purchaseDate: "",
    estimatedSellPrice: 7,
    sellPrice: null,
    sellDate: null,
    notes: "",
    photoDataUrl: null,
    accent: "#7c5cff",
    category: "pc",
    isPublic: false,
    createdAt: "2026-11-17T00:00:00.000Z",
    updatedAt: "2026-11-17T00:00:00.000Z",
    ...partial,
  };
}

type Result = { error: { message: string; code?: string } | null; status?: number };

function client(upsert: (row: Record<string, unknown>) => Result = () => ({ error: null })) {
  const upserts: Record<string, unknown>[] = [];
  const supabase = {
    from(table: string) {
      assert.equal(table, "cards");
      return {
        upsert(row: Record<string, unknown>) {
          upserts.push(row);
          return Promise.resolve(upsert(row));
        },
      };
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, upserts };
}

/** PostgREST's answer while cards.insert_name isn't in the database yet. */
const NO_INSERT_COLUMN = (row: Record<string, unknown>): Result =>
  "insert_name" in row
    ? { error: { code: "PGRST204", message: "Could not find the 'insert_name' column of 'cards' in the schema cache" }, status: 400 }
    : { error: null };

describe("the insert name is saved with the card", () => {
  it("saves insert_name with every other detail", async () => {
    const { supabase, upserts } = client();
    await saveUserCard(supabase, "user-1", card({ insertName: "Rookie Code" }), 5_000);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].insert_name, "Rookie Code");
    assert.equal(upserts[0].card_number, "RC-3");
    assert.equal(upserts[0].year_label, "2026-27");
  });

  it("a card whose insert isn't known sends no insert_name, so nothing changes for it", async () => {
    const { supabase, upserts } = client(NO_INSERT_COLUMN);
    await saveUserCard(supabase, "user-1", card({ insertName: undefined }), 5_000);
    assert.equal(upserts.length, 1);
    assert.equal("insert_name" in upserts[0], false);
  });

  it("a cleared insert sends insert_name: null, so a saved one can be removed (upserts never drop a column)", async () => {
    const { supabase, upserts } = client();
    await saveUserCard(supabase, "user-1", card({ insertName: "" }), 5_000);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].insert_name, null);
  });

  it("clearing before the column is added: saved again without it, every other detail kept", async () => {
    const { supabase, upserts } = client(NO_INSERT_COLUMN);
    await saveUserCard(supabase, "user-1", card({ insertName: "" }), 5_000);
    assert.equal(upserts.length, 2);
    assert.equal("insert_name" in upserts[1], false);
    assert.equal(upserts[1].year_label, "2026-27");
  });

  it("before the column is added: saved again without it, every other detail kept", async () => {
    const { supabase, upserts } = client(NO_INSERT_COLUMN);
    await saveUserCard(supabase, "user-1", card({ insertName: "Rookie Code", serialRun: null, isRookie: true }), 5_000);
    assert.equal(upserts.length, 2);
    const saved = upserts[1];
    assert.equal("insert_name" in saved, false);
    // Never the bare fallback: the year label, # and rookie flag all still save.
    assert.equal(saved.year_label, "2026-27");
    assert.equal(saved.set_name, "Topps");
    assert.equal(saved.is_rookie, true);
    assert.equal(saved.condition_type, "raw");
  });

  it("an insert name is never longer than 80 characters or padded", async () => {
    const { supabase, upserts } = client();
    await saveUserCard(supabase, "user-1", card({ insertName: `  ${"Rookie Code ".repeat(20)}` }), 5_000);
    const saved = String(upserts[0].insert_name);
    assert.ok(saved.length <= 80, saved);
    assert.equal(saved, saved.trim());
  });

  it("is read back from the row, and left out when the column isn't there yet", () => {
    const row = { id: "c", user_id: "u", player: "Cameron Boozer", year: 2026, set: "Topps", grade: "Raw", parallel: "Base", paid_price: null, estimated_value: 7, image_url: null, card_number: "RC-3", sport: "Basketball", purchase_date: null, sell_price: null, sell_date: null, notes: null, accent: null, is_public: false, created_at: "2026-11-17T00:00:00Z", updated_at: null } satisfies CardRow;
    assert.equal(mapCardRow({ ...row, insert_name: "Rookie Code" }).insertName, "Rookie Code");
    assert.equal(mapCardRow({ ...row, insert_name: null }).insertName, "");
    assert.equal("insertName" in mapCardRow(row), false);
  });
});

describe("from the scan to the collection", () => {
  it("one-tap add carries the insert", () => {
    const input = cardInputFromScan(ROOKIE_CODE, { photo: null, accent: "#7c5cff", isPublic: false });
    assert.equal(input?.insertName, "Rookie Code");
    const plain = cardInputFromScan({ ...ROOKIE_CODE, insertName: undefined }, { photo: null, accent: "#7c5cff", isPublic: false });
    assert.equal(plain?.insertName, undefined);
  });

  it("the Add card handoff carries it, and an older handoff without it still opens", () => {
    const handoff = scanHandoffFrom(ROOKIE_CODE, "abcdef123456");
    const parsed = parseScanHandoff(JSON.stringify(handoff));
    assert.equal(parsed?.insertName, "Rookie Code");
    assert.equal(scanCardStart(parsed!).insertName, "Rookie Code");
    const older: Record<string, unknown> = { ...handoff };
    delete older.insertName;
    const old = parseScanHandoff(JSON.stringify(older));
    assert.ok(old);
    assert.equal(old.insertName, "");
    assert.equal(parseScanHandoff(JSON.stringify({ ...handoff, insertName: 42 })), null);
  });

  it("kept only while the set and card # are the scan's, and cleared (\"\") once they're not", () => {
    const start = { setBrand: "Topps", cardNumber: "RC-3", insertName: "Rookie Code" };
    assert.equal(insertNameForSave(start, { setBrand: "Topps", cardNumber: "RC-3" }), "Rookie Code");
    assert.equal(insertNameForSave(start, { setBrand: " topps ", cardNumber: "rc3" }), "Rookie Code");
    // Another card: cleared, so the save sends insert_name: null.
    assert.equal(insertNameForSave(start, { setBrand: "Topps", cardNumber: "258" }), "");
    assert.equal(insertNameForSave(start, { setBrand: "Topps Chrome", cardNumber: "RC-3" }), "");
    // Nothing known: left alone.
    assert.equal(insertNameForSave(null, { setBrand: "Topps", cardNumber: "RC-3" }), undefined);
    assert.equal(insertNameForSave({ ...start, insertName: "" }, { setBrand: "Topps", cardNumber: "RC-3" }), undefined);
  });

  it("editing a saved Rookie Code card: kept while the set and # stay, cleared when either changes", () => {
    const saved = card({ insertName: "Rookie Code" });
    assert.equal(insertNameForSave(saved, { setBrand: "Topps", cardNumber: "RC-3" }), "Rookie Code");
    assert.equal(insertNameForSave(saved, { setBrand: "Topps", cardNumber: "RC-4" }), "");
    assert.equal(insertNameForSave(card({ insertName: undefined }), { setBrand: "Topps", cardNumber: "258" }), undefined);
  });
});

describe("shown with the set", () => {
  it("the collection tile reads 2026-27 · Topps Rookie Code", () => {
    assert.equal(yearSetLine(card({ insertName: "Rookie Code" })), "2026-27 · Topps Rookie Code");
    assert.equal(yearSetLine(card()), "2026-27 · Topps");
    // A set that already says it isn't doubled.
    assert.equal(yearSetLine(card({ setBrand: "Topps Rookie Code", insertName: "Rookie Code" })), "2026-27 · Topps Rookie Code");
  });

  it("the card page title reads 2026-27 Topps Rookie Code", () => {
    assert.equal(cardTitle(card({ insertName: "Rookie Code" })), "2026-27 Topps Rookie Code");
    assert.equal(cardTitle(card()), "2026-27 Topps");
  });

  it("the card page lists it as Insert", () => {
    assert.deepEqual(insertSpec(card({ insertName: "Rookie Code" })), { label: "Insert", value: "Rookie Code" });
    assert.equal(insertSpec(card()), null);
    assert.equal(insertNameOf({ insertName: "  " }), "");
  });
});

describe("kept on this device too (no account yet)", () => {
  it("a card saved in the browser keeps its insert name", () => {
    const store = new Map<string, string>();
    const local = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) };
    const g = globalThis as { window?: unknown };
    const before = g.window;
    g.window = { localStorage: local };
    try {
      saveCollection([card({ insertName: "Rookie Code" }), card({ id: "plain", cardNumber: "258" })]);
      const [rc3, plain] = loadCollection();
      assert.equal(rc3.insertName, "Rookie Code");
      assert.equal("insertName" in plain, false);
    } finally {
      g.window = before;
    }
  });
});
