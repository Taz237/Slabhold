import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { before, describe, it } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { signupPath } from "@/lib/auth/safe-next";
import { CardPeopleView } from "@/components/card-people-view";
import {
  CARD_PERSON_KEYS,
  completeCardFollow,
  followControlVisible,
  optimisticFollowClick,
  rollbackFollowClick,
  type CardPerson,
  type OwnersAndHunters,
} from "@/lib/cards/people";
import type { PeopleDb, PeopleQuery } from "@/lib/cards/owners";

const nodeRequire = createRequire(import.meta.url);
const serverOnlyEmpty = pathToFileURL(
  nodeRequire.resolve("server-only").replace(/index\.js$/, "empty.js"),
).href;

type ResolveHook = (
  specifier: string,
  context: object,
  nextResolve: (specifier: string, context: object) => { url: string },
) => { url: string; shortCircuit?: boolean };

const registerHooks = (
  nodeRequire("node:module") as { registerHooks?: (hooks: { resolve: ResolveHook }) => void }
).registerHooks;

if (!registerHooks) {
  throw new Error("node:module registerHooks is required to import server-only modules in tests");
}

const hookFlag = "__slabholdServerOnlyTestHook";
if (!(globalThis as Record<string, unknown>)[hookFlag]) {
  (globalThis as Record<string, unknown>)[hookFlag] = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") {
        return { url: serverOnlyEmpty, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}

type Row = Record<string, unknown>;

type OwnersModule = {
  getOwnersAndHunters: (
    identityKey: string,
    viewerId: string | null,
    client?: PeopleDb | null,
  ) => Promise<OwnersAndHunters>;
  identityKeyFromRow: (row: Row) => string;
};

let getOwnersAndHunters: OwnersModule["getOwnersAndHunters"];
let identityKeyFromRow: OwnersModule["identityKeyFromRow"];

before(async () => {
  const loaded = (await import("./owners")) as OwnersModule;
  getOwnersAndHunters = loaded.getOwnersAndHunters;
  identityKeyFromRow = loaded.identityKeyFromRow;
});

const identity = {
  player: "Jaylen Brown",
  year: 2024,
  year_label: "2024",
  set: "Prizm",
  set_name: "Prizm",
  card_number: "7",
  parallel: "Base",
  grade: "10",
  grader: "PSA",
  condition_type: "graded",
  is_public: true,
};

function card(userId: string, id: string, extra: Row = {}): Row {
  return {
    ...identity,
    id,
    user_id: userId,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    paid_price: 999,
    estimated_value: 999,
    email: "leak@secret.test",
    ...extra,
  };
}

function profile(id: string, handle: string, extra: Row = {}): Row {
  return {
    id,
    username: handle,
    display_name: handle,
    avatar_url: null,
    email: `${handle}@secret.test`,
    ...extra,
  };
}

function fakeClient(input: {
  tables: Record<string, Row[]>;
  wantError?: boolean;
  blockedByThem?: readonly string[];
}): PeopleDb {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let limitN: number | null = null;
      const failed = table === "want_list" && input.wantError === true;
      const run = () => {
        let out = (input.tables[table] ?? []).filter((row) => filters.every((fn) => fn(row)));
        if (limitN != null) out = out.slice(0, limitN);
        return out;
      };
      const error = failed
        ? { message: "permission denied for table want_list", code: "42501" }
        : null;
      const builder: PeopleQuery = {
        select() {
          return builder;
        },
        eq(column, value) {
          filters.push((row) => row[column] === value);
          return builder;
        },
        ilike(column, pattern) {
          const raw = pattern.replace(/\\([\\%_])/g, "$1");
          filters.push(
            (row) => String(row[column] ?? "").toLowerCase() === raw.toLowerCase(),
          );
          return builder;
        },
        in(column, values) {
          const allowed = new Set(values);
          filters.push((row) => allowed.has(String(row[column] ?? "")));
          return builder;
        },
        limit(count) {
          limitN = count;
          return builder;
        },
        async maybeSingle() {
          return { data: failed ? null : (run()[0] ?? null), error };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: failed ? null : run(), error }).then(resolve, reject);
        },
      };
      return builder;
    },
    async rpc(fn, args) {
      if (fn === "card_hunters") {
        if (input.wantError) {
          return {
            data: null,
            error: { message: "permission denied for function card_hunters", code: "42501" },
          };
        }
        const key = String(args?.p_card_key ?? "");
        const rows = (input.tables.want_list ?? [])
          .filter((row) => row.card_key === key && row.is_public === true)
          .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
          .map((row) => ({ user_id: row.user_id }));
        return { data: rows, error: null };
      }
      if (fn !== "can_interact") {
        return { data: null, error: { message: "missing", code: "PGRST202" } };
      }
      const other = String(args?.other ?? "");
      if (input.blockedByThem?.includes(other)) return { data: false, error: null };
      return { data: true, error: null };
    },
  };
}

function assertPeople(people: readonly CardPerson[]) {
  for (const person of people) {
    assert.deepEqual(Object.keys(person).sort(), [...CARD_PERSON_KEYS].sort());
    const bag = person as Record<string, unknown>;
    assert.equal("paid" in bag, false);
    assert.equal("paid_price" in bag, false);
    assert.equal("value" in bag, false);
    assert.equal("estimated_value" in bag, false);
    assert.equal("card_id" in bag, false);
    assert.equal("email" in bag, false);
    assert.equal(JSON.stringify(person).includes("secret"), false);
    assert.equal(JSON.stringify(person).includes("999"), false);
  }
}

describe("getOwnersAndHunters", () => {
  it("drops private cards, private collections, and private wants from lists and counts", async () => {
    const sample = card("ada", "card-ada-new", { updated_at: "2026-06-02T00:00:00.000Z" });
    const key = identityKeyFromRow(sample);
    const result = await getOwnersAndHunters(
      key,
      "viewer",
      fakeClient({
        blockedByThem: ["elle"],
        tables: {
          public_cards: [
            sample,
            card("ada", "card-ada-old", { updated_at: "2026-03-01T00:00:00.000Z" }),
            card("viewer", "card-viewer", { updated_at: "2026-07-01T00:00:00.000Z" }),
            card("hia", "card-hia", { updated_at: "2026-05-01T00:00:00.000Z" }),
            card("ben", "card-ben", { is_public: false }),
            card("cole", "card-cole", { collection_public: false }),
            card("dina", "card-dina"),
            card("elle", "card-elle"),
            card("finn", "card-finn"),
            card("gia", "card-gia"),
            card("nova", "card-nova", { parallel: "Silver" }),
          ],
          want_list: [
            {
              user_id: "ivy",
              card_key: key,
              created_at: "2026-04-01T00:00:00.000Z",
              is_public: true,
              target_price: 42,
              email: "ivy@secret.test",
            },
            {
              user_id: "viewer",
              card_key: key,
              created_at: "2026-04-02T00:00:00.000Z",
              is_public: true,
              target_price: 42,
            },
            {
              user_id: "joe",
              card_key: key,
              created_at: "2026-04-03T00:00:00.000Z",
              is_public: false,
              target_price: 42,
            },
            {
              user_id: "ken",
              card_key: key,
              created_at: "2026-04-04T00:00:00.000Z",
              target_price: 42,
            },
          ],
          profiles: [
            profile("ada", "ada", { display_name: "Ada Stone" }),
            profile("viewer", "viewer"),
            profile("hia", "hia"),
            profile("ben", "ben"),
            profile("cole", "cole"),
            profile("dina", "dina"),
            profile("elle", "elle"),
            profile("finn", "finn"),
            profile("gia", "gia", { publicly_visible: false }),
            profile("nova", "nova"),
            profile("ivy", "ivy"),
            profile("joe", "joe"),
            profile("ken", "ken"),
          ],
          follows: [{ follower_id: "viewer", following_id: "hia" }],
          blocks: [{ blocker_id: "viewer", blocked_id: "dina" }],
          mutes: [{ muter_id: "viewer", muted_id: "finn" }],
        },
      }),
    );

    assert.equal(result.owners.count, 3);
    assert.deepEqual(
      result.owners.people.map((person) => person.handle),
      ["ada", "hia"],
    );
    assert.equal(result.owners.people[0]?.displayName, "Ada Stone");
    assert.equal(result.owners.people[1]?.isFollowedByViewer, true);
    assert.equal(result.owners.people[0]?.isFollowedByViewer, false);
    assert.equal(result.hunters?.count, 2);
    assert.deepEqual(
      result.hunters?.people.map((person) => person.handle),
      ["ivy"],
    );
    assertPeople(result.owners.people);
    assertPeople(result.hunters?.people ?? []);
    const blob = JSON.stringify(result);
    assert.equal(blob.includes("secret"), false);
    assert.equal(blob.includes("999"), false);
    assert.equal(blob.includes("card-ada"), false);
    assert.equal(blob.includes("42"), false);
  });

  it("shows signed-out counts, at most 5 avatars, and omits hunters when wants are unreadable", async () => {
    const sample = card("user0", "c0");
    const key = identityKeyFromRow(sample);
    const cards = Array.from({ length: 6 }, (_, index) =>
      card(`user${index}`, `c${index}`, {
        updated_at: `2026-02-0${index + 1}T00:00:00.000Z`,
      }),
    );
    const result = await getOwnersAndHunters(
      key,
      null,
      fakeClient({
        wantError: true,
        tables: {
          public_cards: cards,
          profiles: cards.map((row) => profile(String(row.user_id), `user${String(row.user_id).slice(4)}`)),
        },
      }),
    );

    assert.equal(result.owners.count, 6);
    assert.equal(result.owners.people.length, 5);
    assert.deepEqual(
      result.owners.people.map((person) => person.handle),
      ["user5", "user4", "user3", "user2", "user1"],
    );
    assert.equal(result.hunters, null);
    assertPeople(result.owners.people);
  });

  it("lists two public hunters and drops a private want and a blocked hunter", async () => {
    const sample = card("owner", "card-owner");
    const key = identityKeyFromRow(sample);
    const result = await getOwnersAndHunters(
      key,
      "viewer",
      fakeClient({
        tables: {
          public_cards: [sample],
          want_list: [
            {
              user_id: "ada",
              card_key: key,
              is_public: true,
              created_at: "2026-04-01T00:00:00.000Z",
              target_price: 42,
              notes: "secret note",
              email: "ada@secret.test",
            },
            {
              user_id: "ben",
              card_key: key,
              is_public: true,
              created_at: "2026-04-02T00:00:00.000Z",
              target_price: 42,
            },
            {
              user_id: "cole",
              card_key: key,
              is_public: false,
              created_at: "2026-04-03T00:00:00.000Z",
              target_price: 11,
              notes: "private note",
            },
            {
              user_id: "dina",
              card_key: key,
              is_public: true,
              created_at: "2026-04-04T00:00:00.000Z",
              target_price: 7,
            },
          ],
          profiles: [
            profile("owner", "owner"),
            profile("ada", "ada"),
            profile("ben", "ben"),
            profile("cole", "cole"),
            profile("dina", "dina"),
            profile("viewer", "viewer"),
          ],
          blocks: [{ blocker_id: "viewer", blocked_id: "dina" }],
        },
      }),
    );

    assert.equal(result.hunters?.count, 2);
    assert.deepEqual(
      result.hunters?.people.map((person) => person.handle).sort(),
      ["ada", "ben"],
    );
    assertPeople(result.hunters?.people ?? []);
    const blob = JSON.stringify(result);
    assert.equal(blob.includes("secret"), false);
    assert.equal(blob.includes("42"), false);
    assert.equal(blob.includes("private note"), false);
    assert.equal(blob.includes("cole"), false);
    assert.equal(blob.includes("dina"), false);
  });

  it("counts a signed-in viewer who wants the card and leaves them off the list", async () => {
    const sample = card("owner", "card-owner");
    const key = identityKeyFromRow(sample);
    const result = await getOwnersAndHunters(
      key,
      "viewer",
      fakeClient({
        tables: {
          public_cards: [card("viewer", "card-viewer")],
          want_list: [
            {
              user_id: "viewer",
              card_key: key,
              is_public: true,
              created_at: "2026-05-01T00:00:00.000Z",
            },
            {
              user_id: "ada",
              card_key: key,
              is_public: true,
              created_at: "2026-05-02T00:00:00.000Z",
            },
          ],
          profiles: [profile("viewer", "viewer"), profile("ada", "ada")],
        },
      }),
    );

    assert.equal(result.owners.count, 1);
    assert.deepEqual(result.owners.people, []);
    assert.equal(result.hunters?.count, 2);
    assert.deepEqual(
      result.hunters?.people.map((person) => person.handle),
      ["ada"],
    );
    assertPeople(result.hunters?.people ?? []);
  });

  it("shows a signed-out hunter count and at most five avatars", async () => {
    const sample = card("owner", "card-owner");
    const key = identityKeyFromRow(sample);
    const wantList = Array.from({ length: 7 }, (_, index) => ({
      user_id: `hunter${index}`,
      card_key: key,
      is_public: true,
      created_at: `2026-03-0${index + 1}T00:00:00.000Z`,
      target_price: 42,
    }));
    const result = await getOwnersAndHunters(
      key,
      null,
      fakeClient({
        tables: {
          public_cards: [],
          want_list: wantList,
          profiles: wantList.map((row) => profile(String(row.user_id), String(row.user_id))),
        },
      }),
    );

    assert.equal(result.hunters?.count, 7);
    assert.equal(result.hunters?.people.length, 5);
    assertPeople(result.hunters?.people ?? []);

    const html = renderToStaticMarkup(
      createElement(CardPeopleView, {
        data: result,
        signedIn: false,
        signupHref: signupPath("/cards/sample"),
        renderFollow: () => createElement("button", { type: "button" }, "Follow"),
      }),
    );
    assert.match(html, /Hunters \(7\)/);
    assert.equal((html.match(/href="\/u\//g) ?? []).length, 5);
    assert.equal(html.includes(">Follow<"), false);
  });
});

describe("card people view", () => {
  const cardPath = "/u/ada/cards/ba95893e-89fe-4735-be3f-1509b6b6f3b9";

  it("shows signed-out counts, five avatars, no follow buttons, and the signup link", () => {
    const people = Array.from({ length: 6 }, (_, index) => ({
      handle: `user${index}`,
      displayName: `User ${index}`,
      avatarUrl: null,
      isFollowedByViewer: false,
    }));
    const html = renderToStaticMarkup(
      createElement(CardPeopleView, {
        data: { owners: { count: 6, people }, hunters: { count: 4, people: people.slice(0, 4) } },
        signedIn: false,
        signupHref: signupPath(cardPath),
        renderFollow: () => createElement("button", { type: "button" }, "Follow"),
      }),
    );
    assert.match(html, /Owners \(6\)/);
    assert.match(html, /Hunters \(4\)/);
    assert.equal((html.match(/href="\/u\//g) ?? []).length, 9);
    assert.equal(html.includes(">Follow<"), false);
    assert.ok(html.includes("Join to follow collectors"));
    assert.ok(html.includes(signupPath(cardPath)));
  });

  it("hides follow for people the viewer already follows and shows empty copy", () => {
    const html = renderToStaticMarkup(
      createElement(CardPeopleView, {
        data: {
          owners: {
            count: 2,
            people: [
              {
                handle: "ada",
                displayName: "Ada",
                avatarUrl: null,
                isFollowedByViewer: true,
              },
              {
                handle: "ben",
                displayName: "Ben",
                avatarUrl: null,
                isFollowedByViewer: false,
              },
            ],
          },
          hunters: { count: 0, people: [] },
        },
        signedIn: true,
        signupHref: "/signup",
        renderFollow: (person) =>
          person.isFollowedByViewer
            ? null
            : createElement("button", { type: "button" }, "Follow"),
      }),
    );
    assert.equal((html.match(/>Follow</g) ?? []).length, 1);
    assert.ok(html.includes("hunting this yet"));
    assert.equal(html.includes("Join to follow collectors"), false);

    const empty = renderToStaticMarkup(
      createElement(CardPeopleView, {
        data: { owners: { count: 0, people: [] }, hunters: null },
        signedIn: true,
        signupHref: "/signup",
      }),
    );
    assert.match(empty, /No public owners yet/);
    assert.equal(empty.includes("Hunters"), false);

    const onlyYou = renderToStaticMarkup(
      createElement(CardPeopleView, {
        data: { owners: { count: 1, people: [] }, hunters: { count: 0, people: [] } },
        signedIn: true,
        signupHref: "/signup",
      }),
    );
    assert.match(onlyYou, /Only you so far/);
    assert.equal(onlyYou.includes("Owners (1)"), false);
    assert.equal(onlyYou.includes("No public owners yet"), false);
  });
});

describe("card follow", () => {
  it("hides on an optimistic follow and restores the button when the follow fails", () => {
    const before = { showingFollow: true };
    const pending = optimisticFollowClick();
    assert.equal(pending.showingFollow, false);
    assert.equal(followControlVisible({ followed: false, optimistic: true, failed: false }), false);
    const back = rollbackFollowClick();
    assert.deepEqual(back, before);
    assert.equal(followControlVisible({ followed: false, optimistic: null, failed: true }), true);
  });

  it("calls track with only source after a successful follow", async () => {
    const calls: { name: string; props?: unknown }[] = [];
    const track = (name: string, props?: unknown) => {
      calls.push({ name, props });
    };
    const failed = await completeCardFollow("card_owners", async () => ({ error: "nope" }), track);
    assert.equal(failed, "error");
    assert.equal(calls.length, 0);
    const ok = await completeCardFollow("card_hunters", async () => ({}), track);
    assert.equal(ok, "ok");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.name, "follow");
    assert.deepEqual(calls[0]?.props, { source: "card_hunters" });
    assert.deepEqual(Object.keys(calls[0]?.props as object), ["source"]);
  });

  it("wires the card follow button through the optimistic helper", () => {
    const button = readFileSync(join(process.cwd(), "components/follow-button.tsx"), "utf8");
    const owners = readFileSync(join(process.cwd(), "lib/cards/owners.ts"), "utf8");
    const people = readFileSync(join(process.cwd(), "lib/cards/people.ts"), "utf8");
    assert.match(button, /optimisticFollowClick\(\)/);
    assert.match(button, /rollbackFollowClick\(\)/);
    assert.match(button, /completeCardFollow\(source/);
    assert.match(button, /trackEvent\("follow_clicked"\)/);
    assert.match(people, /track\("follow", \{ source \}\)/);
    assert.match(owners, /unstable_cache/);
    assert.match(owners, /if \(!viewerId\)/);
    assert.match(owners, /rpc\("card_hunters"/);
    assert.doesNotMatch(owners, /from\("want_list"\)/);
    assert.doesNotMatch(owners, /createSupabaseAdmin|service_role|SUPABASE_SERVICE_ROLE/);
    assert.doesNotMatch(owners, /paid_price|target_price|estimated_value/);

    const migrationDir = join(process.cwd(), "supabase", "migrations");
    const sqlFiles = readdirSync(migrationDir).filter((name) => name.endsWith(".sql") && name.includes("card_hunters"));
    assert.deepEqual(sqlFiles, ["20261020220000_card_hunters.sql"]);
    const sql = readFileSync(join(migrationDir, sqlFiles[0] ?? ""), "utf8");
    assert.match(sql, /security definer/);
    assert.match(sql, /set search_path = public/);
    assert.match(sql, /returns table \(\s*user_id uuid\s*\)/);
    assert.match(sql, /revoke all on function public\.card_hunters\(text\) from public/);
    assert.match(sql, /grant execute on function public\.card_hunters\(text\) to anon, authenticated/);
    assert.match(sql, /w\.is_public is true/);
    assert.doesNotMatch(sql, /create policy|drop policy|alter policy/i);
    const body = sql.slice(sql.indexOf("as $$"), sql.lastIndexOf("$$;"));
    assert.match(body, /select s\.user_id/);
    assert.doesNotMatch(body, /target_price|label|notes/);
  });
});
