import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  canAddPick,
  collectPromptVisible,
  collectSportChoices,
  collectStepAfter,
  interestLimitReached,
  interestTypeahead,
  interestWriteRows,
  interestsAnswered,
  persistInterestRows,
  PICK_LIMIT_MESSAGE,
  picksFromRows,
  rpcMissing,
  schemaMissing,
  trapTabTarget,
} from "./collect-interests";

describe("collect sports", () => {
  it("offers the main sports plus catalog sports, and never Pokémon or TCG", () => {
    const sports = collectSportChoices(["Racing", "Pokémon", "Pokemon", "Magic: The Gathering", "Yu-Gi-Oh", "One Piece TCG"]);
    assert.deepEqual(sports.slice(0, 5), ["Football", "Basketball", "Baseball", "Hockey", "Soccer"]);
    assert.equal(sports.includes("Racing"), true);
    assert.equal(sports.includes("Other"), true);
    assert.equal(sports.some((sport) => /pok[eé]mon|tcg|yu-gi-oh|magic/i.test(sport)), false);
  });
});

describe("interest typeahead", () => {
  const players = [
    { name: "Victor Wembanyama", sport: "Basketball" },
    { name: "Patrick Mahomes", sport: "Football" },
    { name: "Pikachu", sport: "Pokémon" },
  ];

  it("finds catalog players and teams, narrowed by the sports they picked", () => {
    const chiefs = interestTypeahead({ query: "chief", players });
    assert.deepEqual(
      chiefs.map((hit) => `${hit.kind}:${hit.value}`),
      ["team:Chiefs"],
    );
    const wemby = interestTypeahead({ query: "wemb", players, sports: ["Basketball"] });
    assert.deepEqual(
      wemby.map((hit) => `${hit.kind}:${hit.value}`),
      ["player:Victor Wembanyama"],
    );
    assert.equal(interestTypeahead({ query: "wemb", players, sports: ["Football"] }).length, 0);
    assert.equal(interestTypeahead({ query: "pika", players }).length, 0);
    assert.equal(interestTypeahead({ query: "   ", players }).length, 0);
  });

  it("collapses punctuation variants and keeps different sports apart", () => {
    const stroud = interestTypeahead({
      query: "stroud",
      players: [
        { name: "CJ Stroud", sport: "Football" },
        { name: "C.J. Stroud", sport: "Football" },
      ],
      teams: [],
    });
    assert.deepEqual(
      stroud.map((hit) => hit.value),
      ["CJ Stroud"],
    );
    const reversed = interestTypeahead({
      query: "stroud",
      players: [
        { name: "C.J. Stroud", sport: "Football" },
        { name: "CJ Stroud", sport: "Football" },
      ],
      teams: [],
    });
    assert.deepEqual(
      reversed.map((hit) => hit.value),
      ["CJ Stroud"],
    );
    const majorityPlayers = [
      ...Array.from({ length: 3 }, () => ({ name: "C.J. Stroud", sport: "Football" })),
      ...Array.from({ length: 9 }, () => ({ name: "CJ Stroud", sport: "Football" })),
    ];
    for (const query of ["c.j. stroud", "C.J. Stroud", "c j stroud"]) {
      const majority = interestTypeahead({
        query,
        players: majorityPlayers,
        teams: [],
      });
      assert.deepEqual(
        majority.map((hit) => hit.value),
        ["CJ Stroud"],
        query,
      );
    }
    const crossed = [
      { name: "Cameron Johnston", sport: "Football" },
      { name: "Chandler Brayboy", sport: "Football" },
      { name: "Brianna Turner", sport: "Basketball" },
      { name: "CJ Stroud", sport: "Football" },
    ];
    for (const query of ["john st", "ray bo", "brian na"]) {
      const hits = interestTypeahead({ query, players: crossed, teams: [] });
      assert.deepEqual(
        hits.map((hit) => hit.value),
        [],
        query,
      );
    }
    const blank = interestTypeahead({
      query: "stroud",
      players: [
        { name: "CJ Stroud", sport: "" },
        { name: "C.J. Stroud", sport: "Football" },
      ],
      teams: [],
    });
    assert.deepEqual(
      blank.map((hit) => `${hit.value}/${hit.sport}`).sort(),
      ["C.J. Stroud/Football", "CJ Stroud/"],
    );
    const smiths = interestTypeahead({
      query: "will smith",
      players: [
        { name: "Will Smith", sport: "Baseball" },
        { name: "Will Smith", sport: "Hockey" },
      ],
      teams: [],
    });
    assert.deepEqual(
      smiths.map((hit) => `${hit.value}/${hit.sport}`),
      ["Will Smith/Baseball", "Will Smith/Hockey"],
    );
  });
});

describe("collect prompt", () => {
  it("shows once for someone who has not answered, and hides when the table is missing", () => {
    assert.equal(
      collectPromptVisible({ signedIn: true, table: "ready", answered: false }),
      true,
    );
    assert.equal(
      collectPromptVisible({ signedIn: true, table: "missing", answered: false }),
      false,
    );
    assert.equal(
      collectPromptVisible({ signedIn: true, table: "loading", answered: false }),
      false,
    );
    assert.equal(
      collectPromptVisible({ signedIn: false, table: "ready", answered: false }),
      false,
    );
    assert.equal(
      collectPromptVisible({
        signedIn: true,
        table: "ready",
        answered: false,
        pathname: "/settings/collecting",
      }),
      false,
    );
    assert.equal(interestsAnswered([{ kind: "prompt" }]), true);
    assert.equal(interestsAnswered([]), false);
  });

  it("walks sports, then names, then collectors in three steps", () => {
    assert.deepEqual(collectStepAfter("sports", "next"), { type: "step", step: "names" });
    assert.deepEqual(collectStepAfter("names", "next"), { type: "step", step: "people" });
    assert.deepEqual(collectStepAfter("people", "next"), { type: "done" });
    assert.deepEqual(collectStepAfter("names", "back"), { type: "step", step: "sports" });
    assert.deepEqual(collectStepAfter("sports", "skip"), { type: "skip" });
    assert.deepEqual(collectStepAfter("names", "skip"), { type: "skip" });
  });
});

describe("skip and complete", () => {
  it("skip writes only the dismissed prompt", () => {
    assert.deepEqual(interestWriteRows("skip", [{ kind: "player", value: "Patrick Mahomes" }]), [
      { kind: "prompt", value: "skipped" },
    ]);
  });

  it("complete stores sports, teams, and players, and drops Pokémon", () => {
    const rows = interestWriteRows("complete", [
      { kind: "sport", value: "Football" },
      { kind: "sport", value: "Pokémon" },
      { kind: "team", value: "Chiefs" },
      { kind: "player", value: "Patrick Mahomes" },
      { kind: "player", value: "Patrick Mahomes" },
    ]);
    assert.deepEqual(rows, [
      { kind: "sport", value: "Football" },
      { kind: "team", value: "Chiefs" },
      { kind: "player", value: "Patrick Mahomes" },
      { kind: "prompt", value: "done" },
    ]);
    assert.deepEqual(picksFromRows(rows), [
      { kind: "sport", value: "Football" },
      { kind: "team", value: "Chiefs" },
      { kind: "player", value: "Patrick Mahomes" },
    ]);
  });

  it("stops at 25 picks and says so, instead of a generic save error", async () => {
    assert.equal(PICK_LIMIT_MESSAGE, "You can pick up to 25");
    assert.equal(canAddPick(24), true);
    assert.equal(canAddPick(25), false);
    assert.equal(interestLimitReached({ code: "23514", message: "profile interests are limited to 50 rows" }), true);
    assert.equal(interestLimitReached({ code: "23514", message: "check constraint" }), false);
    assert.equal(interestLimitReached({ message: "insert failed" }), false);
    assert.equal(trapTabTarget(3, 2, false), 0);
    assert.equal(trapTabTarget(3, 0, true), 2);
    assert.equal(trapTabTarget(3, 1, false), null);
    assert.equal(trapTabTarget(3, -1, false), 0);
    assert.equal(trapTabTarget(3, -1, true), 2);
    assert.equal(trapTabTarget(3, 4, false), 0);
    assert.equal(trapTabTarget(3, 4, true), 2);
    const calls: string[] = [];
    const capped = {
      from() {
        return {
          upsert() {
            calls.push("upsert");
            return Promise.resolve({
              error: { code: "23514", message: "profile interests are limited to 50 rows" },
            });
          },
          select() {
            return { eq: () => Promise.resolve({ data: [], error: null }) };
          },
          delete() {
            calls.push("delete");
            return { eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }) };
          },
        };
      },
    };
    const result = await persistInterestRows(capped as never, "user", [
      { kind: "sport", value: "Football" },
    ]);
    assert.equal(result, "limit");
    assert.deepEqual(calls, ["upsert"]);
  });

  it("upserts new picks before deleting the ones that were removed", async () => {
    const calls: string[] = [];
    const client = {
      from() {
        return {
          upsert() {
            calls.push("upsert");
            return Promise.resolve({ error: { message: "insert failed" } });
          },
          select() {
            return {
              eq() {
                calls.push("select");
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
          delete() {
            calls.push("delete");
            return {
              eq() {
                return {
                  eq() {
                    return {
                      eq() {
                        return Promise.resolve({ error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    const failed = await persistInterestRows(client as never, "user", [
      { kind: "sport", value: "Football" },
    ]);
    assert.equal(failed, "error");
    assert.deepEqual(calls, ["select", "upsert"]);
    assert.equal(calls.includes("delete"), false);
    calls.length = 0;
    const stored: { kind: string; value: string }[] = [{ kind: "team", value: "Chiefs" }];
    const ok = {
      from() {
        return {
          upsert(rows: { kind: string; value: string }[]) {
            calls.push("upsert");
            for (const row of rows) stored.push({ kind: row.kind, value: row.value });
            return Promise.resolve({ error: null });
          },
          select() {
            return {
              eq() {
                calls.push("select");
                return Promise.resolve({ data: stored, error: null });
              },
            };
          },
          delete() {
            return {
              eq() {
                return {
                  eq(_column: string, kind: string) {
                    return {
                      eq(_valueColumn: string, value: string) {
                        calls.push(`delete:${kind}:${value}`);
                        return Promise.resolve({ error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    const saved = await persistInterestRows(ok as never, "user", [
      { kind: "sport", value: "Football" },
    ]);
    assert.equal(saved, "saved");
    assert.ok(calls.indexOf("upsert") < calls.indexOf("delete:team:Chiefs"));
    assert.equal(calls.includes("select"), true);
    assert.equal(calls.includes("delete:team:Chiefs"), true);
    assert.equal(calls.includes("delete:sport:Football"), false);
  });

  it("deletes removed picks before the upsert when a 25-for-25 swap would pass 50", async () => {
    const calls: string[] = [];
    const existing = [
      ...Array.from({ length: 25 }, (_, index) => ({ kind: "player", value: `Old ${index + 1}` })),
      { kind: "prompt", value: "done" },
    ];
    const incoming = [
      ...Array.from({ length: 25 }, (_, index) => ({ kind: "player" as const, value: `New ${index + 1}` })),
      { kind: "prompt" as const, value: "done" },
    ];
    const client = {
      from() {
        return {
          upsert() {
            calls.push("upsert");
            return Promise.resolve({ error: null });
          },
          select() {
            return {
              eq() {
                calls.push("select");
                return Promise.resolve({ data: existing, error: null });
              },
            };
          },
          delete() {
            return {
              eq() {
                return {
                  eq(_column: string, kind: string) {
                    return {
                      eq(_valueColumn: string, value: string) {
                        calls.push(`delete:${kind}:${value}`);
                        return Promise.resolve({ error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    const saved = await persistInterestRows(client as never, "user", incoming);
    assert.equal(saved, "saved");
    const upsertAt = calls.indexOf("upsert");
    assert.ok(upsertAt > 0);
    for (let index = 1; index <= 25; index += 1) {
      const deletedAt = calls.indexOf(`delete:player:Old ${index}`);
      assert.ok(deletedAt >= 0 && deletedAt < upsertAt);
    }
    assert.equal(calls.includes("delete:prompt:done"), false);
    assert.equal(calls.some((call) => call.startsWith("delete:player:New")), false);
  });

  it("treats a missing table or ranking function as absent, not as a crash", () => {
    assert.equal(schemaMissing({ code: "PGRST205", message: "schema cache" }), true);
    assert.equal(schemaMissing({ code: "42P01", message: "relation does not exist" }), true);
    assert.equal(schemaMissing({ message: "permission denied" }), false);
    assert.equal(rpcMissing({ code: "PGRST202", message: "Could not find the function" }), true);
    assert.equal(rpcMissing(null), false);
  });
});

describe("collecting UI", () => {
  it("is skippable, editable in settings, and quiet when the table is missing", () => {
    const root = process.cwd();
    const prompt = readFileSync(join(root, "components/collect-prompt.tsx"), "utf8");
    const settings = readFileSync(join(root, "components/collect-settings.tsx"), "utf8");
    const settingsPage = readFileSync(join(root, "app/settings/collecting/page.tsx"), "utf8");
    const editor = readFileSync(join(root, "components/collect-editor.tsx"), "utf8");
    const more = readFileSync(join(root, "components/more-view.tsx"), "utf8");
    const profile = readFileSync(join(root, "components/profile-edit-sheet.tsx"), "utf8");
    const feed = readFileSync(join(root, "components/feed-view.tsx"), "utf8");
    const provider = readFileSync(join(root, "components/social-provider.tsx"), "utf8");
    assert.match(prompt, /What do you collect\?/);
    assert.match(prompt, /role="dialog"/);
    assert.match(prompt, /aria-modal="true"/);
    assert.match(prompt, /previous\.focus\(\)/);
    assert.match(prompt, /trapTabTarget\(/);
    assert.match(prompt, /key === "Escape"/);
    assert.match(prompt, /closeRef\.current\(\)/);
    assert.match(prompt, /PICK_LIMIT_MESSAGE/);
    assert.match(settings, /PICK_LIMIT_MESSAGE/);
    assert.match(prompt, /Skip/);
    assert.match(prompt, /collectPromptVisible\(/);
    assert.match(prompt, /interestWriteRows\("skip"/);
    assert.match(prompt, /interestWriteRows\("complete"/);
    assert.match(prompt, /schemaMissing\(/);
    assert.match(prompt, /persistInterestRows\(/);
    assert.match(prompt, /if \(!visible\) return/);
    assert.match(prompt, /card_catalog/);
    assert.match(prompt, /SUGGESTION_DISPLAY_LIMIT/);
    const interests = readFileSync(join(root, "lib/social/collect-interests.ts"), "utf8");
    const save = interests.slice(interests.indexOf("function persistInterestRows"));
    assert.ok(save.indexOf(".upsert(") < save.indexOf(".delete()"));
    assert.match(provider, /followAllIds\(/);
    assert.match(provider, /suggestionKey/);
    const fetch = provider.slice(provider.indexOf("const suggestionKey"), provider.indexOf("const suggestionsReady"));
    assert.doesNotMatch(fetch, /\bready\b/);
    assert.match(editor, /min-h-11/);
    assert.match(editor, /interestTypeahead\(/);
    assert.match(settings, /What you collect/);
    assert.match(settings, /schemaMissing\(/);
    assert.match(settingsPage, /CollectSettings/);
    assert.match(more, /\/settings\/collecting/);
    assert.match(profile, /\/settings\/collecting/);
    assert.match(feed, /suggestionReason/);
    assert.match(feed, /Follow all/);
    assert.match(feed, /followMany\(/);
    assert.match(provider, /mergeRankedSuggestions\(/);
    assert.match(provider, /followSuggestionFetchLimit\(displayLimit\)/);
    assert.match(provider, /followSuggestions\(candidates/);
    assert.doesNotMatch(prompt, /Pokémon|Pokemon|TCG|Mail Day/i);
    assert.doesNotMatch(editor, /Pokémon|Pokemon|TCG|Mail Day/i);
    assert.doesNotMatch(settings, /Pokémon|Pokemon|TCG|Mail Day/i);
  });
});
