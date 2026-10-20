import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchProfilesForMention } from "./remote";

function searchClient() {
  let orFilter: string | null = null;
  const supabase = {
    auth: {
      async getSession() {
        return { data: { session: null } };
      },
    },
    from() {
      return {
        select() {
          return {
            or(filters: string) {
              orFilter = filters;
              const pending = {
                limit() {
                  return pending;
                },
                abortSignal() {
                  return pending;
                },
                then(
                  onFulfilled?: (value: { data: []; error: null }) => unknown,
                  onRejected?: (reason: unknown) => unknown,
                ) {
                  return Promise.resolve({ data: [] as [], error: null }).then(
                    onFulfilled,
                    onRejected,
                  );
                },
              };
              return pending;
            },
          };
        },
      };
    },
  };
  return {
    supabase,
    orFilter: () => orFilter,
  };
}

describe("searchProfilesForMention", () => {
  it("drops commas, parentheses, and percent so q cannot add filters", async () => {
    const client = searchClient();
    const found = await searchProfilesForMention(
      client.supabase as never,
      "a,b(c)d%",
    );
    assert.deepEqual(found, []);
    assert.deepEqual(client.orFilter()?.split(","), [
      "username.ilike.%abcd%",
      "display_name.ilike.%abcd%",
    ]);

    const blocked = searchClient();
    const empty = await searchProfilesForMention(blocked.supabase as never, "%,()");
    assert.deepEqual(empty, []);
    assert.equal(blocked.orFilter(), null);
  });
});
