import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import ts from "typescript";

/** Files whose effects load supabase-js with `loadSupabaseBrowser().then(...)`. */
const FILES = [
  "components/profile-view.tsx",
  "components/feed-view.tsx",
  "components/compose-view.tsx",
  "components/card-people.tsx",
  "components/post-view.tsx",
  "components/collect-settings.tsx",
  "components/onboarding/first-run-setup.tsx",
  "components/want-button.tsx",
  "components/hunter-setting.tsx",
  "components/leaderboard-opt-in.tsx",
  "components/value-board.tsx",
];

/** `x.name(...)` → the call's method name, else null. */
function methodName(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
}

function isLoadCall(node: ts.Node) {
  return (
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "loadSupabaseBrowser"
  );
}

/**
 * Each `loadSupabaseBrowser().then(...)` chain, with whether it is handled: some
 * call further up the same chain is `.catch(...)`, or a `.then(ok, fail)` has two arguments.
 */
function lazyLoadChains(source: string, fileName = "fixture.tsx") {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const chains: { line: number; handled: boolean }[] = [];
  const visit = (node: ts.Node) => {
    if (isLoadCall(node)) {
      let handled = false;
      let sawThen = false;
      // Walk up the chain: call → property access → call → ...
      let current: ts.Node = node;
      while (ts.isPropertyAccessExpression(current.parent) && ts.isCallExpression(current.parent.parent)) {
        const call = current.parent.parent;
        if (call.expression !== current.parent) break;
        const name = methodName(call);
        if (name === "then") {
          sawThen = true;
          if (call.arguments.length >= 2) handled = true;
        }
        if (name === "catch") handled = true;
        current = call;
      }
      if (sawThen) {
        chains.push({ line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1, handled });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return chains;
}

describe("loadSupabaseBrowser().then chains", () => {
  it("fails on a chain without a catch", () => {
    const bare = `useEffect(() => { void loadSupabaseBrowser().then((s) => { if (!s) return; }); }, []);`;
    assert.deepEqual(lazyLoadChains(bare), [{ line: 1, handled: false }]);
    const inner = `void loadSupabaseBrowser().then((s) => s.from("x").then(() => {}).catch(() => {}));`;
    assert.deepEqual(lazyLoadChains(inner), [{ line: 1, handled: false }]);
  });

  it("accepts an outer catch or then(ok, fail)", () => {
    const caught = `void loadSupabaseBrowser()\n  .then((s) => s)\n  .catch(() => {});`;
    assert.deepEqual(lazyLoadChains(caught), [{ line: 1, handled: true }]);
    const twoArgs = `void loadSupabaseBrowser().then((s) => s, () => {});`;
    assert.deepEqual(lazyLoadChains(twoArgs), [{ line: 1, handled: true }]);
    const finallyThenCatch = `void loadSupabaseBrowser().then((s) => s).finally(() => {}).catch(() => {});`;
    assert.deepEqual(lazyLoadChains(finallyThenCatch), [{ line: 1, handled: true }]);
  });

  for (const path of FILES) {
    it(`every chain in ${path} ends in a catch`, () => {
      const chains = lazyLoadChains(readFileSync(join(process.cwd(), path), "utf8"), path);
      assert.ok(chains.length > 0, `${path} has no loadSupabaseBrowser().then chain`);
      assert.deepEqual(
        chains.filter((chain) => !chain.handled).map((chain) => chain.line),
        [],
        `${path}: unhandled chains at these lines`,
      );
    });
  }
});
