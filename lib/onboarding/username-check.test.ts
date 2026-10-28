import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { usernameError } from "@/lib/social/local-db";
import { TAKEN_USERNAME } from "@/lib/social/username-taken";
import { checkUsername, usernameCandidates, USERNAME_CHECK_DELAY } from "./username-check";

function lookup(taken: string[], calls: string[] = []) {
  return async (name: string) => {
    calls.push(name);
    return taken.includes(name);
  };
}

describe("username availability", () => {
  it("waits a short beat before checking", () => {
    assert.ok(USERNAME_CHECK_DELAY >= 250 && USERNAME_CHECK_DELAY <= 600);
  });

  it("is idle with nothing typed and never looks up", async () => {
    const calls: string[] = [];
    assert.deepEqual(await checkUsername("  ", lookup([], calls)), { status: "idle" });
    assert.deepEqual(calls, []);
  });

  it("uses the existing username rules before any lookup", async () => {
    const calls: string[] = [];
    const result = await checkUsername("a!", lookup([], calls));
    assert.equal(result.status, "invalid");
    assert.equal(result.status === "invalid" ? result.message : "", usernameError("a!"));
    assert.deepEqual(calls, []);
  });

  it("says available, normalized to lowercase", async () => {
    const calls: string[] = [];
    assert.deepEqual(await checkUsername(" Wax_Room ", lookup([], calls)), { status: "available", value: "wax_room" });
    assert.deepEqual(calls, ["wax_room"]);
  });

  it("says taken and offers the first free suggestion", async () => {
    const calls: string[] = [];
    const result = await checkUsername("wax_room", lookup(["wax_room", "wax_room_cards"], calls));
    assert.deepEqual(result, {
      status: "taken",
      value: "wax_room",
      message: TAKEN_USERNAME,
      suggestion: "wax_room_pc",
    });
    assert.deepEqual(calls, ["wax_room", "wax_room_cards", "wax_room_pc"]);
  });

  it("treats a reserved handle as taken and suggests one that is not", async () => {
    const result = await checkUsername("admin", lookup([]));
    assert.equal(result.status, "taken");
    assert.equal(result.status === "taken" ? result.suggestion : null, "admin_cards");
  });

  it("stops after a few lookups when everything is taken", async () => {
    const calls: string[] = [];
    const everything = async (name: string) => {
      calls.push(name);
      return true;
    };
    const result = await checkUsername("wax_room", everything);
    assert.equal(result.status === "taken" ? result.suggestion : "x", null);
    assert.ok(calls.length <= 4);
  });

  it("says unknown when the lookup fails, so sign-up is not blocked", async () => {
    const result = await checkUsername("wax_room", async () => {
      throw new Error("offline");
    });
    assert.deepEqual(result, { status: "unknown", value: "wax_room" });
  });

  it("only suggests names that pass the username rules and fit 20 characters", () => {
    for (const base of ["wax_room", "abcdefghijklmnopqrst", "admin", "abc"]) {
      const names = usernameCandidates(base);
      assert.ok(names.length >= 3, base);
      for (const name of names) {
        assert.equal(usernameError(name), null, name);
        assert.ok(name.length <= 20, name);
        assert.notEqual(name, base);
      }
      assert.equal(new Set(names).size, names.length);
    }
  });
});
