import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSaveTimeout, SaveTimeoutError } from "@/lib/save/attempt";
import type { SportsCard } from "@/lib/types";
import { mapCardRow, saveUserCard, type CardRow } from "./cards";

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
    purchasePrice: 20,
    purchaseDate: "2024-01-01",
    estimatedSellPrice: 40,
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
  upload?: () => Promise<{ error: { message: string } | null }>;
  upsert?: (
    row: Record<string, unknown>,
  ) => Promise<{ error: { message: string; code?: string } | null }>;
}) {
  const removed: string[] = [];
  const upserts: Array<Record<string, unknown>> = [];
  const deleted: string[] = [];
  const rows = new Map<string, Record<string, unknown>>();
  const supabase = {
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "card-photos");
        return {
          upload(path: string) {
            return options?.upload ? options.upload() : Promise.resolve({ error: null, path });
          },
          async remove(paths: string[]) {
            removed.push(...paths);
            return { data: paths.map((name) => ({ name })), error: null };
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://cdn.example/${path}` } };
          },
        };
      },
    },
    from(table: string) {
      assert.equal(table, "cards");
      return {
        upsert(row: Record<string, unknown>) {
          upserts.push(row);
          const pending = options?.upsert
            ? options.upsert(row)
            : Promise.resolve({ error: null as { message: string; code?: string } | null });
          return pending.then((result) => {
            if (!result.error) rows.set(String(row.id), row);
            return result;
          });
        },
        delete() {
          return {
            eq(_column: string, id: string) {
              return {
                eq() {
                  deleted.push(id);
                  rows.delete(id);
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return {
    supabase: supabase as unknown as SupabaseClient,
    removed,
    upserts,
    deleted,
    rows,
  };
}

describe("saveUserCard photos", () => {
  it("keeps a new photo when the card row is saved", async () => {
    const { supabase, removed, upserts } = client();
    await saveUserCard(
      supabase,
      "user-1",
      sample({ id: "kept", purchaseDate: "" }),
      5_000,
    );
    assert.equal(removed.length, 0);
    assert.equal(upserts[0]?.purchase_date, null);
    assert.match(String(upserts[0]?.image_url), /^https:\/\/cdn\.example\/user-1\//);
  });

  it("deletes a new photo when the card row fails, and leaves an existing url alone", async () => {
    const failed = client({
      upsert: async () => ({ error: { message: "Could not save this card.", code: "23505" } }),
    });
    await assert.rejects(
      saveUserCard(failed.supabase, "user-1", sample({ id: "orphan" }), 5_000),
      /Could not save this card/,
    );
    assert.equal(failed.removed.length, 1);
    assert.match(failed.removed[0] ?? "", /^user-1\/.+\.jpg$/);

    const existing = client({
      upsert: async () => ({ error: { message: "Could not save this card.", code: "23505" } }),
    });
    await assert.rejects(
      saveUserCard(
        existing.supabase,
        "user-1",
        sample({
          id: "linked",
          photoDataUrl: "https://cdn.example/user-1/already.jpg",
        }),
        5_000,
      ),
      /Could not save this card/,
    );
    assert.deepEqual(existing.removed, []);
  });

  it("keeps one row and its photo when the upsert lands after a timeout, and retry does not add another", async () => {
    let finishUpsert: (value: { error: null }) => void = () => undefined;
    const saved = client({
      upsert: (row) =>
        new Promise((resolve) => {
          finishUpsert = (value) => {
            if (!value.error) saved.rows.set(String(row.id), row);
            resolve(value);
          };
        }),
    });
    const card = sample({ id: "same-card" });
    const failed = saveUserCard(saved.supabase, "user-1", card, 40);
    const error = await failed.then(
      () => null,
      (reason: unknown) => reason,
    );
    assert.ok(isSaveTimeout(error));
    assert.ok(error instanceof SaveTimeoutError);
    assert.match(error.photoUrl ?? "", /^https:\/\/cdn\.example\/user-1\//);
    assert.equal(saved.removed.length, 0);
    assert.equal(saved.deleted.length, 0);
    finishUpsert({ error: null });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(saved.rows.size, 1);
    const landed = saved.rows.get("same-card");
    assert.equal(landed?.image_url, error.photoUrl);
    assert.equal(saved.removed.length, 0);

    const retry = client({
      upsert: async (row) => {
        saved.rows.set(String(row.id), row);
        saved.upserts.push(row);
        return { error: null };
      },
    });
    await saveUserCard(
      retry.supabase,
      "user-1",
      sample({ id: "same-card", photoDataUrl: error.photoUrl }),
      5_000,
    );
    assert.equal(saved.rows.size, 1);
    assert.equal(saved.rows.get("same-card")?.image_url, error.photoUrl);
    assert.equal(saved.removed.length, 0);
    assert.equal(retry.removed.length, 0);
    assert.equal(saved.deleted.length, 0);
  });

  it("keeps a new edit photo when the upsert lands after a timeout", async () => {
    let finishUpsert: (value: { error: null }) => void = () => undefined;
    const edited = client({
      upsert: (row) =>
        new Promise((resolve) => {
          finishUpsert = (value) => {
            if (!value.error) edited.rows.set(String(row.id), row);
            resolve(value);
          };
        }),
    });
    const error = await saveUserCard(
      edited.supabase,
      "user-1",
      sample({
        id: "edit-card",
        photoDataUrl: "data:image/jpeg;base64,YQ==",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-04-01T00:00:00.000Z",
      }),
      40,
    ).then(
      () => null,
      (reason: unknown) => reason,
    );
    assert.ok(error instanceof SaveTimeoutError);
    finishUpsert({ error: null });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(edited.removed.length, 0);
    assert.equal(edited.deleted.length, 0);
    assert.equal(edited.rows.size, 1);
    assert.equal(edited.rows.get("edit-card")?.image_url, error.photoUrl);
  });

  it("keeps a blank purchase date blank when the row is read back", () => {
    const card = mapCardRow({
      id: "1",
      user_id: "user-1",
      player: "A",
      year: 2024,
      set: "Prizm",
      grade: null,
      parallel: null,
      paid_price: null,
      estimated_value: null,
      image_url: null,
      card_number: null,
      sport: null,
      purchase_date: null,
      sell_price: null,
      sell_date: null,
      notes: null,
      accent: null,
      is_public: false,
      created_at: "2024-06-01T00:00:00.000Z",
      updated_at: null,
    } as CardRow);
    assert.equal(card.purchaseDate, "");
  });
});
