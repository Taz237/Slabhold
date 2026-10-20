import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { removeStorage, runAccountDelete, type AccountAdmin } from "./delete-account";

const CARD_ID = "11111111-1111-4111-8111-111111111111";

type StoredNote = { kind: string; href: string | null };

function scrubMatchingNotes(notes: StoredNote[], kind: string, orFilter: string) {
  const clauses = orFilter.split(",");
  for (const note of notes) {
    const href = note.href;
    if (note.kind !== kind || !href) continue;
    const matches = clauses.some((clause) => {
      if (clause.startsWith("href.eq.")) return href === clause.slice("href.eq.".length);
      if (clause.startsWith("href.like.*")) {
        return href.endsWith(clause.slice("href.like.*".length));
      }
      return false;
    });
    if (matches) note.href = "/collection";
  }
}

function admin(opts?: {
  storageError?: boolean;
  rowError?: boolean;
  scrubError?: boolean;
  cardHrefError?: boolean;
  username?: string;
  cardIds?: string[];
  notes?: StoredNote[];
}) {
  const calls: string[] = [];
  const updates: {
    table: string;
    preview?: string | null;
    href?: string | null;
    filters: string[];
  }[] = [];
  const snapshotChunks: string[][] = [];
  const notes = opts?.notes ?? [];
  let deleted: string | null = null;
  const remaining = new Map<string, { name: string }[]>();
  const client: AccountAdmin = {
    storage: {
      from(bucket: string) {
        if (!remaining.has(bucket)) {
          remaining.set(bucket, opts?.storageError ? [] : [{ name: "photo.jpg" }]);
        }
        return {
          async list() {
            calls.push("storage.list");
            if (opts?.storageError) return { data: null, error: { message: "list failed" } };
            return { data: remaining.get(bucket) ?? [], error: null };
          },
          async remove(paths: string[]) {
            calls.push("storage.remove");
            const gone = new Set(paths.map((path) => path.split("/").pop()));
            remaining.set(
              bucket,
              (remaining.get(bucket) ?? []).filter((file) => !gone.has(file.name)),
            );
            return { error: null };
          },
        };
      },
    },
    from(table: string) {
      return {
        select() {
          return {
            async eq() {
              calls.push(`select:${table}`);
              if (table === "profiles") {
                return { data: [{ username: opts?.username ?? "sam" }], error: null };
              }
              if (table === "cards") {
                return {
                  data: (opts?.cardIds ?? [CARD_ID]).map((id) => ({ id })),
                  error: null,
                };
              }
              return { data: [{ id: "card-1" }], error: null };
            },
          };
        },
        delete() {
          return {
            async eq() {
              calls.push(`delete:${table}`);
              if (opts?.rowError && table === "want_alerts") {
                return { error: { message: "delete failed" } };
              }
              return { error: null };
            },
            async in(_column: string, values: string[]) {
              calls.push(`delete:${table}`);
              if (table === "card_value_snapshots") snapshotChunks.push([...values]);
              return { error: null };
            },
          };
        },
        update(values: { preview?: string | null; href?: string | null }) {
          return {
            eq(column: string, value: string) {
              const filters = [`${column}=${value}`];
              const finish = (more: string) => {
                filters.push(more);
                const recorded: (typeof updates)[number] = { table, filters };
                if ("preview" in values) recorded.preview = values.preview;
                if ("href" in values) recorded.href = values.href;
                updates.push(recorded);
                calls.push(`update:${table}`);
                if (opts?.scrubError) return { error: { message: "scrub failed" } };
                return { error: null };
              };
              return {
                eq: (column2: string, value2: string) =>
                  Promise.resolve(finish(`${column2}=${value2}`)),
                in: (column2: string, values2: readonly string[]) =>
                  Promise.resolve(finish(`${column2}=${values2.join(",")}`)),
                or: (filter: string) => {
                  filters.push(filter);
                  const recorded: (typeof updates)[number] = { table, filters };
                  if ("preview" in values) recorded.preview = values.preview;
                  if ("href" in values) recorded.href = values.href;
                  updates.push(recorded);
                  calls.push(`update:${table}`);
                  if (opts?.cardHrefError) {
                    return Promise.resolve({ error: { message: "card href scrub failed" } });
                  }
                  if (column === "kind" && values.href) scrubMatchingNotes(notes, value, filter);
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    },
    auth: {
      admin: {
        async deleteUser(userId: string) {
          deleted = userId;
          calls.push(`auth:${userId}`);
          return { error: null };
        },
      },
    },
  };
  return {
    client,
    calls,
    updates,
    snapshotChunks,
    notes,
    deleted: () => deleted,
  };
}

describe("account delete", () => {
  it("returns 401 when there is no session", async () => {
    const fake = admin();
    const result = await runAccountDelete({
      sessionUserId: null,
      body: { userId: "someone-else" },
      admin: fake.client,
    });
    assert.equal(result.status, 401);
    assert.equal(fake.deleted(), null);
    assert.equal(fake.calls.length, 0);
  });

  it("uses the session user id, not the body", async () => {
    const fake = admin();
    const result = await runAccountDelete({
      sessionUserId: "real-user",
      body: { userId: "attacker" },
      admin: fake.client,
    });
    assert.equal(result.status, 200);
    assert.equal(fake.deleted(), "real-user");
  });

  it("does not call deleteUser when storage cleanup fails", async () => {
    const fake = admin({ storageError: true });
    const result = await runAccountDelete({
      sessionUserId: "real-user",
      body: { userId: "attacker" },
      admin: fake.client,
    });
    assert.equal(result.status, 500);
    assert.equal(fake.deleted(), null);
    assert.equal(fake.calls.includes("delete:want_alerts"), false);
  });

  it("does not call deleteUser when row cleanup fails", async () => {
    const fake = admin({ rowError: true });
    const result = await runAccountDelete({
      sessionUserId: "real-user",
      body: null,
      admin: fake.client,
    });
    assert.equal(result.status, 500);
    assert.equal(fake.deleted(), null);
    assert.equal(fake.calls.includes("delete:want_alerts"), true);
  });

  it("scrubs notifications this user caused before deleting their rows", async () => {
    const fake = admin();
    const result = await runAccountDelete({
      sessionUserId: "real-user",
      body: null,
      admin: fake.client,
    });
    assert.equal(result.status, 200);
    assert.deepEqual(fake.updates, [
      {
        table: "notifications",
        preview: "Someone posted a card you want",
        href: "/collection",
        filters: ["actor_id=real-user", "kind=want_alert"],
      },
      {
        table: "notifications",
        preview: null,
        href: null,
        filters: ["actor_id=real-user", "kind=comment,mention,quote"],
      },
      {
        table: "notifications",
        href: "/collection",
        filters: [
          "kind=want_alert",
          `href.eq./cards/${CARD_ID},href.like.*/cards/${CARD_ID}`,
        ],
      },
    ]);
    const firstDelete = fake.calls.findIndex((call) => call.startsWith("delete:"));
    const firstUpdate = fake.calls.indexOf("update:notifications");
    assert.ok(firstUpdate >= 0 && firstUpdate < firstDelete);
    const cardHrefUpdate = fake.calls.lastIndexOf("update:notifications");
    const storageList = fake.calls.indexOf("storage.list");
    const cardsDelete = fake.calls.indexOf("delete:cards");
    assert.ok(fake.calls.indexOf("select:cards") < cardHrefUpdate);
    assert.ok(cardHrefUpdate < storageList);
    assert.ok(storageList < firstDelete);
    assert.ok(cardHrefUpdate < cardsDelete);
    assert.equal(
      fake.updates[2]?.filters.some((filter) => filter.startsWith("actor_id=")),
      false,
    );

    const privacy = readFileSync(join(process.cwd(), "app/privacy/page.tsx"), "utf8");
    assert.match(
      privacy,
      /Notifications you caused for other people stay in their inbox, but your name and any preview of what you wrote are removed\./,
    );
    assert.equal(privacy.includes("without your name"), false);
  });

  it("does not delete the account when notification scrubbing fails", async () => {
    const fake = admin({ scrubError: true });
    const result = await runAccountDelete({
      sessionUserId: "real-user",
      body: null,
      admin: fake.client,
    });
    assert.equal(result.status, 500);
    assert.equal(fake.deleted(), null);
    assert.equal(fake.calls.includes("delete:want_alerts"), false);
    assert.equal(fake.calls.filter((call) => call === "update:notifications").length, 1);
  });

  it("scrubs an old card link after the owner renamed", async () => {
    const oldHref = `/u/oldname/cards/${CARD_ID}`;
    const otherCard = "22222222-2222-4222-8222-222222222222";
    const notes: StoredNote[] = [
      { kind: "want_alert", href: oldHref },
      { kind: "want_alert", href: `/cards/${CARD_ID}` },
      { kind: "want_alert", href: `/u/renamed/cards/${otherCard}` },
    ];
    const fake = admin({
      username: "renamed",
      cardIds: [CARD_ID, "not-a-uuid"],
      notes,
    });
    const result = await runAccountDelete({
      sessionUserId: "real-user",
      body: null,
      admin: fake.client,
    });
    assert.equal(result.status, 200);
    assert.equal(notes[0]?.href, "/collection");
    assert.equal(notes[1]?.href, "/collection");
    assert.equal(notes[2]?.href, `/u/renamed/cards/${otherCard}`);
    assert.equal(fake.calls.includes("select:profiles"), false);
    const hrefFilter = fake.updates
      .flatMap((update) => update.filters)
      .find((filter) => filter.includes("href.like."));
    assert.equal(hrefFilter, `href.eq./cards/${CARD_ID},href.like.*/cards/${CARD_ID}`);
    assert.equal(hrefFilter?.includes("renamed"), false);
    assert.equal(hrefFilter?.includes("oldname"), false);
    assert.equal(hrefFilter?.includes("not-a-uuid"), false);
  });

  it("deletes 500 cards in chunks of 50", async () => {
    const cardIds = Array.from({ length: 500 }, (_, index) => {
      return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
    });
    const fake = admin({ cardIds });
    const result = await runAccountDelete({
      sessionUserId: "real-user",
      body: null,
      admin: fake.client,
    });
    assert.equal(result.status, 200);
    const hrefFilters = fake.updates
      .flatMap((update) => update.filters)
      .filter((filter) => filter.includes("href.eq."));
    assert.equal(hrefFilters.length, 10);
    assert.equal(fake.snapshotChunks.length, 10);
    const idsIn = (filter: string) =>
      filter
        .split(",")
        .filter((clause) => clause.startsWith("href.eq."))
        .map((clause) => clause.slice("href.eq./cards/".length));
    assert.deepEqual(idsIn(hrefFilters[0] ?? ""), cardIds.slice(0, 50));
    assert.deepEqual(idsIn(hrefFilters[9] ?? ""), cardIds.slice(450, 500));
    assert.deepEqual(fake.snapshotChunks[0], cardIds.slice(0, 50));
    assert.deepEqual(fake.snapshotChunks[9], cardIds.slice(450, 500));
    assert.ok(fake.snapshotChunks.every((chunk) => chunk.length === 50));
    const lastHref = fake.calls.lastIndexOf("update:notifications");
    const firstSnapshot = fake.calls.indexOf("delete:card_value_snapshots");
    assert.ok(lastHref >= 0 && lastHref < firstSnapshot);
  });

  it("deletes nothing when the card-link scrub fails", async () => {
    const fake = admin({ cardHrefError: true });
    const result = await runAccountDelete({
      sessionUserId: "real-user",
      body: null,
      admin: fake.client,
    });
    assert.equal(result.status, 500);
    assert.equal(
      result.body.error,
      "Couldn't delete your account data. Your account is still active.",
    );
    assert.equal(fake.deleted(), null);
    assert.equal(fake.calls.some((call) => call.startsWith("delete:")), false);
    assert.equal(fake.calls.includes("storage.list"), false);
    assert.equal(fake.calls.includes("storage.remove"), false);
  });

  it("deletes 250 storage files across pages from offset 0", async () => {
    const files = Array.from({ length: 250 }, (_, index) => ({ name: `file-${index}.jpg` }));
    const removed: string[] = [];
    const offsets: number[] = [];
    const client: AccountAdmin = {
      storage: {
        from(bucket: string) {
          return {
            async list(_folder: string, opts?: { offset?: number }) {
              offsets.push(opts?.offset ?? 0);
              if (bucket !== "card-photos") return { data: [], error: null };
              return { data: files.slice(0, 100), error: null };
            },
            async remove(paths: string[]) {
              removed.push(...paths);
              files.splice(0, paths.length);
              return { error: null };
            },
          };
        },
      },
      from() {
        throw new Error("rows should not run in this test");
      },
      auth: { admin: { async deleteUser() { throw new Error("auth should not run"); } } },
    };
    const error = await removeStorage(client, "user-1");
    assert.equal(error, null);
    assert.equal(removed.length, 250);
    assert.ok(offsets.every((offset) => offset === 0));
    assert.ok(offsets.length > 3);
  });

  it("errors instead of hanging when remove leaves the same files", async () => {
    let lists = 0;
    let removes = 0;
    const client: AccountAdmin = {
      storage: {
        from() {
          return {
            async list() {
              lists += 1;
              return { data: [{ name: "stuck.jpg" }, { name: "also.jpg" }], error: null };
            },
            async remove() {
              removes += 1;
              return { error: null };
            },
          };
        },
      },
      from() {
        return {
          select() {
            return {
              async eq() {
                return { data: [], error: null };
              },
            };
          },
          delete() {
            throw new Error("rows should not run");
          },
          update() {
            return {
              eq() {
                return {
                  async eq() {
                    return { error: null };
                  },
                  async in() {
                    return { error: null };
                  },
                  async or() {
                    return { error: null };
                  },
                };
              },
            };
          },
        };
      },
      auth: {
        admin: {
          async deleteUser() {
            throw new Error("deleteUser should not run");
          },
        },
      },
    };
    const error = await removeStorage(client, "user-1");
    assert.match(error ?? "", /storage cleanup made no progress/);
    assert.equal(removes, 1);
    assert.equal(lists, 2);

    const result = await runAccountDelete({
      sessionUserId: "real-user",
      body: { userId: "someone-else" },
      admin: client,
    });
    assert.equal(result.status, 500);
  });
});
