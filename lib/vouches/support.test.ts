import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { resetVouchSupport, vouchesMissing, vouchesSupported, vouchSupportKnown } from "./support";

function probe(answers: ({ code?: string; message?: string } | null | "throw")[]) {
  const calls: [string, Record<string, unknown>][] = [];
  return {
    calls,
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push([name, args]);
      const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
      if (answer === "throw") throw new Error("offline");
      return { error: answer ?? null };
    },
  };
}

describe("vouch support gate", () => {
  beforeEach(() => resetVouchSupport());

  it("knows a missing function or table from any other error", () => {
    assert.equal(vouchesMissing(null), false);
    for (const code of ["PGRST202", "PGRST205", "42883", "42P01"]) assert.equal(vouchesMissing({ code }), true, code);
    assert.equal(vouchesMissing({ message: "Could not find the function public.vouch_summaries(p_user_ids) in the schema cache" }), true);
    assert.equal(vouchesMissing({ code: "42501", message: "permission denied" }), false);
    assert.equal(vouchesMissing({ code: "22023", message: "Ask for 50 profiles or fewer at a time" }), false);
  });

  it("asks once with an empty vouch_summaries call, and remembers yes", async () => {
    const db = probe([null]);
    assert.equal(vouchSupportKnown(), null);
    assert.equal(await vouchesSupported(db), true);
    assert.equal(await vouchesSupported(db), true);
    assert.deepEqual(db.calls, [["vouch_summaries", { p_user_ids: [] }]]);
    assert.equal(vouchSupportKnown(), true);
  });

  it("remembers no when the migration isn't there, so nothing vouch-related renders", async () => {
    const db = probe([{ code: "PGRST202", message: "Could not find the function" }]);
    assert.equal(await vouchesSupported(db), false);
    assert.equal(await vouchesSupported(db), false);
    assert.equal(db.calls.length, 1);
    assert.equal(vouchSupportKnown(), false);
  });

  it("reads any other failure as not yet, and asks again next time", async () => {
    const db = probe([{ code: "57014", message: "timeout" }, "throw", null]);
    assert.equal(await vouchesSupported(db), false);
    assert.equal(vouchSupportKnown(), null);
    assert.equal(await vouchesSupported(db), false);
    assert.equal(await vouchesSupported(db), true);
    assert.equal(db.calls.length, 3);
  });

  it("shares one probe between screens that ask at the same moment", async () => {
    const db = probe([null]);
    const answers = await Promise.all([vouchesSupported(db), vouchesSupported(db), vouchesSupported(db)]);
    assert.deepEqual(answers, [true, true, true]);
    assert.equal(db.calls.length, 1);
  });
});
