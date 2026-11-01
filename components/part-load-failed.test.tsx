import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import ts from "typescript";
import { installDom } from "@/lib/test/dom";
import { LAZY_PART_RETRY_MS, lazyPart } from "@/lib/ui/lazy-part";
import { PartLoadFailed, SheetLoadFailed } from "./part-load-failed";
import { PartLoadFailed as ReExported } from "./card-page-parts";

installDom();

type SheetProps = { label: string; onClose: () => void };
const RealSheet = ({ label }: SheetProps) => createElement("p", null, `sheet ${label}`);

let root: Root;
let host: HTMLElement;
const realWarn = console.warn;

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout"] });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  console.warn = () => {};
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  mock.timers.reset();
  console.warn = realWarn;
});

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function tick(ms: number) {
  await act(async () => {
    mock.timers.tick(ms);
  });
  await settle();
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === name) ?? null;

/** A sheet part whose chunk fails until `working` is set, drawn after its automatic retry. */
async function failedSheet() {
  const state = { working: false, closes: 0 };
  const Part = lazyPart<SheetProps>(
    async () => {
      if (!state.working) throw new Error("offline");
      return RealSheet;
    },
    null,
    { name: "test-sheet", failed: SheetLoadFailed },
  );
  act(() => root.render(createElement(Part, { label: "a", onClose: () => void (state.closes += 1) })));
  await settle();
  assert.equal(dialog(), null, "nothing before the retry gives up");
  await tick(LAZY_PART_RETRY_MS);
  return state;
}

describe("SheetLoadFailed, for parts that open from a tap", () => {
  it("draws a small dialog with Try again and Close after the automatic retry fails", async () => {
    await failedSheet();
    const sheet = dialog();
    assert.ok(sheet, "dialog");
    assert.equal(sheet.getAttribute("aria-label"), "Couldn't open this");
    assert.match(sheet.textContent ?? "", /Couldn't load this\./);
    assert.ok(button("Try again"));
    assert.ok(button("Close"));
    assert.match(button("Try again")!.className, /bg-violet-600/);
    assert.match(button("Try again")!.className, /min-h-11/);
    assert.match(button("Close")!.className, /min-h-11/);
    assert.doesNotMatch(sheet.outerHTML, /teal|cyan/);
  });

  it("Close calls onClose", async () => {
    const state = await failedSheet();
    act(() => button("Close")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    assert.equal(state.closes, 1);
  });

  it("Escape calls onClose", async () => {
    const state = await failedSheet();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(state.closes, 1);
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.equal(state.closes, 1);
  });

  it("Try again draws the real part once the chunk loads", async () => {
    const state = await failedSheet();
    state.working = true;
    act(() => button("Try again")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    assert.equal(dialog(), null);
    assert.match(host.textContent ?? "", /sheet a/);
    assert.equal(state.closes, 0);
  });

  it("PartLoadFailed lives in the new file and card-page-parts still re-exports it", () => {
    assert.equal(ReExported, PartLoadFailed);
  });
});

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** For each `lazyPart(() => import("<module>")...)` in a file: its options' keys and the name it gives. */
function lazyPartOptions(path: string) {
  const file = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map<string, { keys: string[]; name: string | null }>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "lazyPart") {
      const target = /import\("([^"]+)"\)/.exec(node.arguments[0]?.getText() ?? "")?.[1];
      const options = node.arguments[2];
      const keys: string[] = [];
      let name: string | null = null;
      if (options && ts.isObjectLiteralExpression(options)) {
        for (const prop of options.properties) {
          if (!prop.name || !ts.isIdentifier(prop.name)) continue;
          keys.push(prop.name.text);
          if (prop.name.text === "name" && ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.initializer)) {
            name = prop.initializer.text;
          }
        }
      }
      if (target) found.set(target, { keys, name });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

const TAP_OPENED = [
  { file: "components/share-sheet.tsx", target: "@/components/share-sheet-view", name: "share-sheet" },
  { file: "components/card-detail.tsx", target: "@/components/deal-sheet", name: "deal-sheet" },
  { file: "components/push/push-manager.tsx", target: "@/components/onboarding/install-step", name: "install-guide" },
  {
    file: "components/push/notification-settings.tsx",
    target: "@/components/onboarding/install-step",
    name: "install-guide",
  },
  { file: "components/card-page-parts.tsx", target: "@/components/card-added-panel", name: "card-added-panel" },
  { file: "components/dashboard.tsx", target: "@/components/want-list", name: "want-list" },
];

describe("tap-opened lazy parts", () => {
  for (const { file, target, name } of TAP_OPENED) {
    it(`${file} gives ${target} a name and a failed view`, () => {
      const options = lazyPartOptions(file).get(target);
      assert.ok(options, `no lazyPart for ${target}`);
      assert.equal(options.name, name);
      assert.ok(options.keys.includes("failed"), `${target} has no failed option`);
    });
  }

  it("the failed views import none of the lazy chunks", () => {
    const source = read("components/part-load-failed.tsx");
    for (const { target } of TAP_OPENED) assert.ok(!source.includes(target), target);
    assert.doesNotMatch(source, /import\(/);
  });
});
