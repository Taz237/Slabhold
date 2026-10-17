import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runAccountDelete, type AccountAdmin } from "./delete-account";

function admin(opts?: { storageError?: boolean; rowError?: boolean }) {
  const calls: string[] = [];
  let deleted: string | null = null;
  const client: AccountAdmin = {
    storage: {
      from() {
        return {
          async list() {
            calls.push("storage.list");
            if (opts?.storageError) return { data: null, error: { message: "list failed" } };
            return { data: [{ name: "photo.jpg" }], error: null };
          },
          async remove() {
            calls.push("storage.remove");
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
});
