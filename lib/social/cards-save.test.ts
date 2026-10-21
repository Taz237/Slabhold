import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSaveTimeout } from "@/lib/save/attempt";
import type { SportsCard } from "@/lib/types";
import { mapCardRow, noteFreshInsert, saveUserCard, type CardRow } from "./cards";

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
  upsert?: () => Promise<{ error: { message: string; code?: string } | null }>;
}) {
  const removed: string[] = [];
  const upserts: Array<Record<string, unknown>> = [];
  const deleted: string[] = [];
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
          const pending = options?.upsert ? options.upsert() : Promise.resolve({ error: null });
          return { abortSignal: () => pending };
        },
        delete() {
          return {
            eq(_column: string, id: string) {
              return {
                eq() {
                  deleted.push(id);
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

  it("times out a hung save, deletes the new photo, and drops only a fresh insert", async () => {
    let finishUpload: (value: { error: null }) => void = () => undefined;
    const hungUpload = client({
      upload: () =>
        new Promise((resolve) => {
          finishUpload = resolve;
        }),
    });
    await assert.rejects(
      saveUserCard(hungUpload.supabase, "user-1", sample({ id: "upload-hang" }), 40),
      (error: unknown) => isSaveTimeout(error),
    );
    finishUpload({ error: null });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(hungUpload.removed.length, 1);
    assert.deepEqual(hungUpload.deleted, []);

    let finishUpsert: (value: { error: null }) => void = () => undefined;
    const fresh = client({
      upsert: () =>
        new Promise((resolve) => {
          finishUpsert = resolve;
        }),
    });
    const stamp = "2024-03-01T00:00:00.000Z";
    noteFreshInsert("fresh-card");
    await assert.rejects(
      saveUserCard(
        fresh.supabase,
        "user-1",
        sample({ id: "fresh-card", createdAt: stamp, updatedAt: stamp }),
        40,
      ),
      (error: unknown) => isSaveTimeout(error),
    );
    assert.equal(fresh.removed.length, 1);
    finishUpsert({ error: null });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(fresh.deleted, ["fresh-card"]);

    let finishEdit: (value: { error: null }) => void = () => undefined;
    const edit = client({
      upsert: () =>
        new Promise((resolve) => {
          finishEdit = resolve;
        }),
    });
    await assert.rejects(
      saveUserCard(edit.supabase, "user-1", sample({ id: "edit-card" }), 40),
      (error: unknown) => isSaveTimeout(error),
    );
    finishEdit({ error: null });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(edit.removed.length, 1);
    assert.deepEqual(edit.deleted, []);
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
