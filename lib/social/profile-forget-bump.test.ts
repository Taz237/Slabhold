import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createKeyBatcher } from "./public-card-cache";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function batcher() {
  return createKeyBatcher<string>(
    async (keys) => keys,
    () => {},
    () => {},
  );
}

describe("forget says whether it forgot anything read", () => {
  it("true for a key that was read, false once it is gone", async () => {
    const people = batcher();
    people.request(["id:a"]);
    await tick();
    assert.equal(people.forget(["id:a", "id:b"]), true);
    assert.equal(people.forget(["id:a"]), false);
  });

  it("false after a reset (sign-out), so the reload's forget adds no second reset", async () => {
    const people = batcher();
    people.request(["id:a", "user:slabfan"]);
    await tick();
    people.reset();
    assert.equal(people.forget(["id:a", "user:slabfan"]), false);
  });

  it("false for keys never read or still on the way", () => {
    const people = batcher();
    assert.equal(people.forget(["id:x"]), false);
    people.request(["id:x"]);
    assert.equal(people.forget(["id:x"]), false);
  });
});

describe("forgetPeople", () => {
  it("bumps the people generation only when the batcher forgot something read", () => {
    const src = readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
    const body = /const forgetPeople = useCallback\(\s*\(keys: readonly string\[\]\) => \{([\s\S]*?)\n    \},/.exec(src)?.[1];
    assert.ok(body, "forgetPeople");
    assert.match(body, /if \(!profileBatcher\.forget\(keys\)\) return;[\s\S]*setProfileSettled[\s\S]*setPeopleGeneration/);
  });
});
