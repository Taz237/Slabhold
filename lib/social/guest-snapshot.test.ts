import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSupabaseSocial } from "./remote";

/** Any query chain resolves to no rows. Records which tables were read. */
function fakeClient(session: { user: { id: string; email: string } } | null) {
  const tables: string[] = [];
  const empty = { data: [], error: null, count: 0 };
  const chain = (): unknown =>
    new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === "then") return (resolve: (value: unknown) => void) => resolve(empty);
        return () => chain();
      },
      apply: () => chain(),
    });
  const client = {
    auth: { getSession: async () => ({ data: { session } }) },
    from(table: string) {
      tables.push(table);
      return chain();
    },
    rpc: () => chain(),
    storage: { from: () => chain() },
  };
  return { client: client as unknown as SupabaseClient, tables };
}

describe("guest snapshot", () => {
  it("skips inbox reads for a visitor with no session", async () => {
    const { client, tables } = fakeClient(null);
    const snapshot = await loadSupabaseSocial(client);
    assert.equal(snapshot.user, null);
    assert.deepEqual(snapshot.notifications, []);
    assert.deepEqual(snapshot.messages, []);
    for (const table of ["notifications", "messages", "blocks", "mutes"]) {
      assert.equal(tables.includes(table), false, table);
    }
    for (const table of ["posts", "comments", "reposts"]) {
      assert.ok(tables.includes(table), table);
    }
    // A visitor has no follow edges of their own, and nobody to read profiles for.
    assert.equal(tables.includes("follows"), false);
    // Public cards are read per screen, never as the whole table.
    assert.equal(tables.includes("public_cards"), false);
  });

  it("still reads the inbox for a signed-in reader", async () => {
    const { client, tables } = fakeClient({ user: { id: "11111111-1111-4111-8111-111111111111", email: "a@b.c" } });
    await loadSupabaseSocial(client);
    for (const table of ["notifications", "messages", "blocks", "mutes"]) {
      assert.ok(tables.includes(table), table);
    }
  });
});
