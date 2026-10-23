import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { searchCatalog } from "@/lib/card-catalog";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { withDirectoryPlayers } from "@/lib/players/suggest";
import { COLLECT_TEAMS, interestTypeahead } from "@/lib/social/collect-interests";
import {
  NameSearch,
  alternateInitialQuery,
  cardSearchQueries,
  hitsBeforeDirectoryReady,
  nameHitKey,
  pickedNameLabel,
  selectableCollectHits,
  toggleName,
  withoutName,
} from "@/components/collect-editor";

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("HTMLInputElement", win.HTMLInputElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("Event", win.Event);
expose("InputEvent", win.InputEvent);
expose("IS_REACT_ACT_ENVIRONMENT", true);

after(() => {
  win.close();
});

function expectedHits(query: string, sports: readonly string[]) {
  const players = searchCatalog(query.trim(), 20).map((card) => ({
    name: card.playerName,
    sport: card.sport,
  }));
  return withDirectoryPlayers({
    query,
    sports,
    catalogHits: interestTypeahead({ query, sports, players, teams: COLLECT_TEAMS }),
    directoryPlayers: INDEXED_DIRECTORY,
    directoryReady: true,
  });
}

function rowKeys() {
  return [...win.document.querySelectorAll("li[data-key]")].map((node) => node.getAttribute("data-key") ?? "");
}

function assertNoGhosts(query: string, sports: readonly string[]) {
  const hits = expectedHits(query, sports);
  const keys = rowKeys();
  assert.equal(new Set(keys).size, keys.length, `duplicate keys for ${JSON.stringify(query)}: ${keys.join(", ")}`);
  assert.equal(keys.length, hits.length, `ghost rows for ${JSON.stringify(query)}: ${keys.join(", ")}`);
  assert.deepEqual([...keys].sort(), hits.map((hit) => nameHitKey(hit)).sort());
}

function reactOnChange(node: HTMLInputElement): ((event: { target: HTMLInputElement }) => void) | undefined {
  const key = Object.keys(node).find((name) => name.startsWith("__reactProps"));
  if (!key) return undefined;
  const props = (node as unknown as Record<string, { onChange?: (event: { target: HTMLInputElement }) => void }>)[key];
  return props?.onChange;
}

async function setQuery(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    const onChange = reactOnChange(input);
    if (onChange) onChange({ target: input });
    else input.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
}

async function mount(sports: readonly string[]) {
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(NameSearch, {
        sports,
        selected: [],
        onAdd: () => {},
        onRemove: () => {},
      }),
    );
  });
  const input = win.document.querySelector("input");
  assert.ok(input instanceof win.HTMLInputElement);
  await setQuery(input, "will smith");
  for (let attempt = 0; attempt < 40 && rowKeys().length < 2; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  await setQuery(input, "");
  return {
    input,
    async destroy() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function typeBackspaceRetype(sports: readonly string[]) {
  const view = await mount(sports);
  let typed = "";
  const full = "will smith";
  try {
    for (const char of full) {
      typed += char;
      await setQuery(view.input, typed);
      assertNoGhosts(typed, sports);
    }
    const keys = rowKeys();
    assert.deepEqual([...keys].sort(), ["player:Will Smith:Baseball", "player:Will Smith:Hockey"]);
    const text = win.document.body.textContent ?? "";
    assert.match(text, /Player · Baseball/);
    assert.match(text, /Player · Hockey/);
    typed = typed.slice(0, -1);
    await setQuery(view.input, typed);
    assertNoGhosts(typed, sports);
    typed = typed.slice(0, -1);
    await setQuery(view.input, typed);
    assertNoGhosts(typed, sports);
    typed += "t";
    await setQuery(view.input, typed);
    assertNoGhosts(typed, sports);
    typed += "h";
    await setQuery(view.input, typed);
    assertNoGhosts(typed, sports);
    assert.equal(rowKeys().length, 2);
  } finally {
    await view.destroy();
  }
}

describe("collect name rows", () => {
  it("dedupes saved names on the compact key", () => {
    const added = toggleName([], { kind: "player", value: "CJ Stroud", sport: "Football" });
    const again = toggleName(added, { kind: "player", value: "CJ Stroud", sport: "Football" });
    assert.equal(again.length, 1);
    assert.equal(again[0]?.value, "CJ Stroud");
    const legacy = toggleName([{ kind: "player", value: "C.J. Stroud" }], {
      kind: "player",
      value: "CJ Stroud",
      sport: "Football",
    });
    assert.deepEqual(legacy, [{ kind: "player", value: "CJ Stroud" }]);
    const both = [
      { kind: "player" as const, value: "C.J. Stroud" },
      { kind: "player" as const, value: "CJ Stroud" },
    ];
    assert.deepEqual(withoutName(both, { kind: "player", value: "C.J. Stroud" }), [
      { kind: "player", value: "CJ Stroud" },
    ]);
    assert.deepEqual(withoutName(both, { kind: "player", value: "CJ Stroud" }), [
      { kind: "player", value: "C.J. Stroud" },
    ]);
    const baseball = toggleName([], { kind: "player", value: "Will Smith", sport: "Baseball", sharedName: true });
    const smiths = toggleName(baseball, { kind: "player", value: "Will Smith", sport: "Hockey", sharedName: true });
    assert.deepEqual(smiths, [
      { kind: "player", value: "Will Smith", sport: "Baseball" },
      { kind: "player", value: "Will Smith", sport: "Hockey" },
    ]);
    assert.equal(pickedNameLabel(smiths[0]!), "Will Smith · Baseball");
    assert.equal(pickedNameLabel(smiths[1]!), "Will Smith · Hockey");
    assert.equal(pickedNameLabel({ kind: "player", value: "CJ Stroud" }), "CJ Stroud");
    const pending = hitsBeforeDirectoryReady(
      [
        { kind: "team", value: "Chiefs" },
        { kind: "player", value: "Will Smith", sport: "Baseball" },
      ],
      false,
    );
    assert.deepEqual(pending, [{ kind: "team", value: "Chiefs" }]);
    const marked = toggleName([], {
      kind: "player",
      value: "Will Smith\u2060",
      sport: "Baseball",
      sharedName: true,
    });
    assert.equal(marked[0]?.value, "Will Smith");
    assert.equal(marked[0]?.sport, "Baseball");
    assert.deepEqual(withoutName(smiths, { kind: "player", value: "Will Smith", sport: "Baseball" }), [
      { kind: "player", value: "Will Smith", sport: "Hockey" },
    ]);
  });

  it("keeps unique Will Smith rows with no sport selected", async () => {
    await typeBackspaceRetype([]);
  });

  it("keeps unique Will Smith rows with Baseball and Hockey selected", async () => {
    await typeBackspaceRetype(["Baseball", "Hockey"]);
  });

  it("labels shared player chips with the sport and says when nothing matched", async () => {
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root: Root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(NameSearch, {
          sports: [],
          selected: [
            { kind: "player", value: "Will Smith", sport: "Baseball" },
            { kind: "player", value: "Will Smith", sport: "Hockey" },
          ],
          onAdd: () => {},
          onRemove: () => {},
        }),
      );
    });
    const input = win.document.querySelector("input");
    assert.ok(input instanceof win.HTMLInputElement);
    const chips = win.document.body.textContent ?? "";
    assert.match(chips, /Will Smith · Baseball/);
    assert.match(chips, /Will Smith · Hockey/);
    await setQuery(input, "pikachu");
    let text = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      text = win.document.body.textContent ?? "";
      if (text.includes("No players found") && !text.includes("Loading players")) break;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }
    assert.match(text, /No players found/);
    assert.equal(rowKeys().length, 0);
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("saves the catalog spelling when compact initials meet live rows", () => {
    const saved = (query: string, rows: { name: string; sport: string }[]) => {
      const hits = withDirectoryPlayers({
        query,
        catalogHits: interestTypeahead({ query, players: rows, teams: [] }),
        directoryPlayers: INDEXED_DIRECTORY,
        directoryReady: true,
      });
      return hits.find((hit) => hit.kind === "player" && !hit.custom)?.value;
    };
    assert.equal(
      saved(
        "tj parker",
        Array.from({ length: 2 }, () => ({ name: "T.J. Parker", sport: "Football" })),
      ),
      "T.J. Parker",
    );
    assert.equal(
      saved(
        "jc latham",
        Array.from({ length: 13 }, () => ({ name: "J.C. Latham", sport: "Football" })),
      ),
      "J.C. Latham",
    );
    assert.equal(alternateInitialQuery("dont e"), null);
    assert.equal(alternateInitialQuery("john st"), null);
    assert.deepEqual(cardSearchQueries("c.j. stroud"), ["c.j. stroud", "cj stroud"]);
    assert.equal(
      saved("c.j. stroud", [
        ...Array.from({ length: 3 }, () => ({ name: "C.J. Stroud", sport: "Football" })),
        ...Array.from({ length: 9 }, () => ({ name: "CJ Stroud", sport: "Football" })),
      ]),
      "CJ Stroud",
    );
  });

  it("keeps dotted custom names and holds the roster spelling until the card rows arrive", () => {
    const dotted = withDirectoryPlayers({
      query: "A.B. Newguy",
      catalogHits: [],
      directoryPlayers: INDEXED_DIRECTORY,
      directoryReady: true,
    });
    assert.equal(dotted[0]?.value, "A.B. Newguy");
    assert.equal(dotted[0]?.custom, true);
    const lower = withDirectoryPlayers({
      query: "a.b. newguy",
      catalogHits: [],
      directoryPlayers: [],
      directoryReady: true,
    });
    assert.equal(lower[0]?.value, "A.B. Newguy");
    assert.equal(lower[0]?.custom, true);
    const waiting = selectableCollectHits(
      [
        { kind: "player", value: "JC Latham" },
        { kind: "player", value: "A.B. Newguy", custom: true },
        { kind: "team", value: "Chiefs" },
      ],
      [],
      false,
    );
    assert.deepEqual(
      waiting.map((hit) => hit.value),
      ["Chiefs"],
    );
    const catalogBacked = selectableCollectHits(
      [{ kind: "player", value: "J.C. Latham" }, { kind: "team", value: "Chiefs" }],
      ["J.C. Latham"],
      false,
    );
    assert.deepEqual(
      catalogBacked.map((hit) => hit.value),
      ["J.C. Latham", "Chiefs"],
    );
    const arrived = selectableCollectHits(
      [
        { kind: "player", value: "JC Latham" },
        { kind: "player", value: "A.B. Newguy", custom: true },
      ],
      [],
      true,
    );
    assert.deepEqual(
      arrived.map((hit) => hit.value),
      ["JC Latham", "A.B. Newguy"],
    );
  });
});
