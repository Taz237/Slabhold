import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createKeyBatcher } from "./public-card-cache";
import { profileKeys } from "./profile-cache";

function provider() {
  return readFileSync(join(process.cwd(), "components/social-provider.tsx"), "utf8");
}

function callbackBody(source: string, name: string) {
  const at = source.indexOf(`const ${name} = useCallback(`);
  assert.ok(at > -1, name);
  return source.slice(at, source.indexOf("\n  const ", at + 10));
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("people reads start over with the viewer", () => {
  it("reads person X again for viewer B after viewer A read them", async () => {
    const reads: string[][] = [];
    const settled = new Set<string>();
    const batcher = createKeyBatcher<string>(
      async (keys) => {
        reads.push([...keys]);
        return keys;
      },
      (_rows, keys) => keys.forEach((key) => settled.add(key)),
      () => {},
    );
    const x = profileKeys({ usernames: ["x"] });
    // Viewer A reads X.
    batcher.request(x);
    await tick();
    batcher.request(x);
    await tick();
    assert.deepEqual(reads, [["user:x"]]);
    // Viewer B signs in: the provider resets the batcher and its read lists.
    batcher.reset();
    settled.clear();
    batcher.request(x);
    await tick();
    assert.deepEqual(reads, [["user:x"], ["user:x"]]);
    assert.ok(settled.has("user:x"));
  });

  it("resets the people batcher and its read and failed lists wherever public cards reset", () => {
    const source = provider();
    const reset = callbackBody(source, "resetPeople");
    assert.match(reset, /profileBatcher\.reset\(\);/);
    assert.match(reset, /setProfileSettled\(new Set\(\)\);/);
    assert.match(reset, /setProfileFailed\(new Set\(\)\);/);
    const viewer = callbackBody(source, "resetViewerReads");
    assert.match(viewer, /resetPublicCards\(\);/);
    assert.match(viewer, /resetPeople\(\);/);
    for (const name of ["refresh", "signUp", "signIn", "signOut"]) {
      const body = callbackBody(source, name);
      assert.match(body, /resetViewerReads\(\)/, name);
      assert.doesNotMatch(body, /resetPublicCards\(\)/, name);
    }
    assert.match(source, /if \(before !== undefined\) resetViewerReads\(\);/);
    // Screens that already asked ask again after a reset.
    assert.match(callbackBody(source, "requestProfiles"), /peopleGeneration/);
  });

  it("also forgets which posts' replies and reposts were read", () => {
    const viewer = callbackBody(provider(), "resetViewerReads");
    assert.match(viewer, /engagementBatcher\.reset\(\);/);
  });
});
