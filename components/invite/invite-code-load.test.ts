import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import ts from "typescript";
import { loadInviteCode } from "./invite-button";

// No Supabase env in tests, so loadSupabaseBrowser() resolves null and the read gets null.
describe("invite code load", () => {
  it("settles a failed read to null, forgets it, and reads again next time", async () => {
    let reads = 0;
    const failing = async () => {
      reads += 1;
      throw new Error("chunk failed");
    };
    assert.equal(await loadInviteCode("fixture-user-1", failing), null);
    assert.equal(await loadInviteCode("fixture-user-1", failing), null);
    assert.equal(reads, 2);
  });

  it("keeps a good code for the page load", async () => {
    let reads = 0;
    const ok = async () => {
      reads += 1;
      return "ABC123";
    };
    assert.equal(await loadInviteCode("fixture-user-2", ok), "ABC123");
    assert.equal(await loadInviteCode("fixture-user-2", ok), "ABC123");
    assert.equal(reads, 1);
  });
});

describe("social provider's hosted start", () => {
  it("ends the startHosted().then(...) chain in a catch", () => {
    const path = "components/social-provider.tsx";
    const file = ts.createSourceFile(path, readFileSync(join(process.cwd(), path), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const chains: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "startHosted") {
        let current: ts.Node = node;
        const names: string[] = [];
        while (ts.isPropertyAccessExpression(current.parent) && ts.isCallExpression(current.parent.parent)) {
          names.push(current.parent.name.text);
          current = current.parent.parent;
        }
        chains.push(names.join("."));
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    assert.deepEqual(chains, ["then.catch"]);
  });
});
