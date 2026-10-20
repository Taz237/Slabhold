import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { removeStorage, runAccountDelete, type AccountAdmin } from "./delete-account";

function admin(opts?: { storageError?: boolean; rowError?: boolean; scrubError?: boolean }) {
  const calls: string[] = [];
  const updates: { table: string; preview: string | null; filters: string[] }[] = [];
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
            async in() {
              calls.push(`delete:${table}`);
              return { error: null };
            },
          };
        },
        update(values: { preview: string | null }) {
          return {
            eq(column: string, value: string) {
              const filters = [`${column}=${value}`];
              const finish = (more: string) => {
                filters.push(more);
                updates.push({ table, preview: values.preview, filters });
                calls.push(`update:${table}`);
                if (opts?.scrubError) return { error: { message: "scrub failed" } };
                return { error: null };
              };
              return {
                eq: (column2: string, value2: string) =>
                  Promise.resolve(finish(`${column2}=${value2}`)),
                in: (column2: string, values2: readonly string[]) =>
                  Promise.resolve(finish(`${column2}=${values2.join(",")}`)),
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
        filters: ["actor_id=real-user", "kind=want_alert"],
      },
      {
        table: "notifications",
        preview: null,
        filters: ["actor_id=real-user", "kind=comment,mention,quote"],
      },
    ]);
    const firstDelete = fake.calls.findIndex((call) => call.startsWith("delete:"));
    const firstUpdate = fake.calls.indexOf("update:notifications");
    assert.ok(firstUpdate >= 0 && firstUpdate < firstDelete);

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
        throw new Error("rows should not run");
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
