import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hideReportedVouch,
  loadOpenReports,
  removeReportedVouchReply,
  SUSPEND_AUTHOR_MISMATCH,
  SUSPEND_VOUCH_GONE,
  suspendReportedUser,
  VOUCH_REPORT_GONE,
  vouchHref,
} from "@/lib/safety/moderation";
import { REPORT_TARGET_GONE, REPORT_VOUCH_GONE, reportedAccount as plainReportedAccount, reportInsert, saveReport, validateReport, type AuthorLookup, type ReportTargetType } from "@/lib/safety/report";
import { REPORT_TARGET_TYPES, reportedAccountFor as reportedAccount, reportTitle } from "@/lib/safety/vouch-report";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MOD = uuid(900);
const REPORTER = uuid(1);
const VOUCHER = uuid(2);
const SUBJECT = uuid(3);
const VOUCH = uuid(50);
const VOUCH_NO_REPLY = uuid(51);

const noAuthors: AuthorLookup = async () => ({ userId: null });

describe("reporting a vouch or a reply to one", () => {
  it("accepts the two new target types, and still refuses anything else", () => {
    assert.deepEqual([...REPORT_TARGET_TYPES], ["post", "reply", "user", "vouch", "vouch_reply"]);
    for (const targetType of REPORT_TARGET_TYPES) assert.equal(validateReport({ reason: "spam", targetType }), null, targetType);
    assert.equal(validateReport({ reason: "spam", targetType: "message" }), "That report target isn't supported.");
    assert.equal(validateReport({ reason: "spam", targetType: "card" }), "That report target isn't supported.");
    const row = reportInsert({ reporterId: REPORTER, targetType: "vouch_reply", targetId: ` ${VOUCH} `, reportedUserId: SUBJECT, reason: "harassment" });
    assert.deepEqual(row, { reporter_id: REPORTER, target_type: "vouch_reply", target_id: VOUCH, reported_user_id: SUBJECT, reason: "harassment", details: null });
  });

  it("titles the report sheet", () => {
    assert.equal(reportTitle("vouch"), "Report vouch");
    assert.equal(reportTitle("vouch_reply"), "Report reply");
    assert.deepEqual([reportTitle("post"), reportTitle("reply"), reportTitle("user")], ["Report post", "Report reply", "Report user"]);
    // The menu spells the same titles inline, so the report sheet doesn't load the vouch report code.
    const menu = readFileSync(join(process.cwd(), "components/safety-menu.tsx"), "utf8");
    const inline = /const reportLabel =\s+([^;]+);/.exec(menu)?.[1];
    assert.ok(inline, "the menu's title expression");
    const menuTitle = new Function("targetType", `return ${inline}`) as (targetType: ReportTargetType) => string;
    for (const targetType of REPORT_TARGET_TYPES) assert.equal(menuTitle(targetType), reportTitle(targetType), targetType);
  });

  it("a reader's report only fills the column: the database trigger decides who it is about", async () => {
    // No vouch lookup (readers can't read the table): the claimed id passes through, to be overwritten.
    assert.deepEqual(await reportedAccount("vouch", VOUCH, noAuthors, { claimed: VOUCHER }), { userId: VOUCHER });
    assert.deepEqual(await reportedAccount("vouch_reply", VOUCH, noAuthors, { claimed: SUBJECT }), { userId: SUBJECT });
    // Never a made-up target or account.
    assert.deepEqual(await reportedAccount("vouch", "not-a-uuid", noAuthors, { claimed: VOUCHER }), { error: REPORT_VOUCH_GONE });
    assert.deepEqual(await reportedAccount("vouch", "", noAuthors, { claimed: VOUCHER }), { error: REPORT_VOUCH_GONE });
    assert.deepEqual(await reportedAccount("vouch", VOUCH, noAuthors, { claimed: "kev" }), { error: "Missing reported account." });
    assert.deepEqual(await reportedAccount("vouch", VOUCH, noAuthors), { error: "Missing reported account." });
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261127200000_vouches.sql"), "utf8");
    assert.match(sql, /when 'vouch' then\s+select v\.voucher_id into author/);
    assert.match(sql, /when 'vouch_reply' then\s+select v\.subject_id into author .* v\.reply is not null/);
    assert.match(sql, /new\.reported_user_id := author;/);
  });

  it("with the real row (moderators), a vouch is about its voucher and a reply about the subject", async () => {
    const vouches = {
      lookup: async (id: string) => (id === VOUCH ? { voucherId: VOUCHER, subjectId: SUBJECT, hasReply: true } : id === VOUCH_NO_REPLY ? { voucherId: VOUCHER, subjectId: SUBJECT, hasReply: false } : null),
      claimed: uuid(666),
    };
    assert.deepEqual(await reportedAccount("vouch", VOUCH, noAuthors, vouches), { userId: VOUCHER });
    assert.deepEqual(await reportedAccount("vouch_reply", VOUCH, noAuthors, vouches), { userId: SUBJECT });
    assert.deepEqual(await reportedAccount("vouch_reply", VOUCH_NO_REPLY, noAuthors, vouches), { error: REPORT_VOUCH_GONE });
    assert.deepEqual(await reportedAccount("vouch", uuid(404), noAuthors, vouches), { error: REPORT_VOUCH_GONE });
    assert.deepEqual(await reportedAccount("vouch", VOUCH, noAuthors, { lookup: async () => ({ error: "db down" }) }), { error: "db down" });
  });

  it("leaves post, reply and user reports exactly as they were", async () => {
    const authors: AuthorLookup = async (table, id) => ({ userId: table === "posts" && id === "p1" ? "author-1" : table === "comments" && id === "c1" ? "author-2" : null });
    assert.deepEqual(await reportedAccount("post", "p1", authors), { userId: "author-1" });
    assert.deepEqual(await reportedAccount("reply", "c1", authors, { claimed: "someone-else" }), { userId: "author-2" });
    assert.deepEqual(await reportedAccount("post", "gone", authors), { error: REPORT_TARGET_GONE });
    assert.deepEqual(await reportedAccount("user", " u1 ", authors), { userId: "u1" });
    assert.deepEqual(await reportedAccount("message", "m1", authors), { error: "That report target isn't supported." });
    assert.deepEqual(await plainReportedAccount("post", "p1", authors), { userId: "author-1" });
    assert.deepEqual(await plainReportedAccount("vouch", VOUCH, authors), { error: "That report target isn't supported." });
  });

  it("says the vouch is gone when the database can't find it, and a repeat report is still fine", async () => {
    const input = { reporterId: REPORTER, targetType: "vouch", targetId: VOUCH, reportedUserId: VOUCHER, reason: "scam" };
    const failing = (code: string, error: string) => ({ insert: async () => ({ error, code }) });
    assert.deepEqual(await saveReport(failing("P0002", "Report target not found"), input), { ok: false, error: REPORT_VOUCH_GONE });
    assert.deepEqual(await saveReport(failing("23505", "duplicate key"), input), { ok: true });
    assert.deepEqual(await saveReport(failing("P0002", "Report target not found"), { ...input, targetType: "post", targetId: "p1" }), { ok: false, error: "Report target not found" });
  });
});

type Row = Record<string, unknown>;
type Write = { table: string; row: Row; filters: string[] };

/** Fake service-role client over in-memory rows. Never talks to Supabase. */
function fakeAdmin(tables: { reports?: Row[]; vouches?: Row[]; profiles?: Row[]; posts?: Row[]; comments?: Row[] }, options: { vouchesMissing?: boolean } = {}) {
  const writes: Write[] = [];
  const bans: string[] = [];
  const client = {
    auth: {
      admin: {
        async updateUserById(id: string) {
          bans.push(id);
          return { data: { user: { id } }, error: null };
        },
      },
    },
    from(table: string) {
      const filters: string[] = [];
      let rows = [...((tables as Record<string, Row[] | undefined>)[table] ?? [])];
      let write: Row | null = null;
      const missing = table === "vouches" && options.vouchesMissing;
      const result = () => {
        if (missing) return { data: null, error: { code: "42P01", message: 'relation "public.vouches" does not exist' } };
        if (write) for (const row of rows) Object.assign(row, write);
        return { data: rows, error: null };
      };
      const query = {
        select() {
          return query;
        },
        update(row: Row) {
          write = row;
          writes.push({ table, row, filters });
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push(`${column}=${String(value)}`);
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        in(column: string, values: unknown[]) {
          rows = rows.filter((row) => values.includes(row[column]));
          return query;
        },
        is(column: string, value: null) {
          filters.push(`${column} is ${value}`);
          rows = rows.filter((row) => row[column] == null);
          return query;
        },
        not(column: string, operator: string, value: null) {
          filters.push(`${column} not ${operator} ${value}`);
          rows = rows.filter((row) => row[column] != null);
          return query;
        },
        order() {
          return query;
        },
        async maybeSingle() {
          const { data, error } = result();
          return { data: data?.[0] ?? null, error };
        },
        then(resolve: (value: { data: Row[] | null; error: unknown }) => unknown) {
          return Promise.resolve(result()).then(resolve);
        },
      };
      return query;
    },
  };
  return { client: client as unknown as SupabaseClient, writes, bans };
}

const report = (id: string, target_type: string, target_id: string, reported_user_id: string): Row => ({
  id,
  reporter_id: REPORTER,
  target_type,
  target_id,
  reported_user_id,
  reason: "harassment",
  details: null,
  status: "open",
  created_at: "2026-11-28T10:00:00.000Z",
});
const vouchRow = (extra: Row = {}): Row => ({
  id: VOUCH,
  voucher_id: VOUCHER,
  subject_id: SUBJECT,
  note: "Card had a corner ding.",
  reply: "Refunded the difference.",
  hidden_at: null,
  hidden_by: null,
  reply_hidden_at: null,
  ...extra,
});
const profiles: Row[] = [
  { id: REPORTER, username: "reporter" },
  { id: VOUCHER, username: "kev" },
  { id: SUBJECT, username: "sam" },
];
const asMod = (admin: ReturnType<typeof fakeAdmin>) => ({ getUserId: async () => MOD, createAdmin: () => admin.client, adminIds: MOD });

describe("moderating a reported vouch", () => {
  it("links a vouch to its place on the subject's page", () => {
    assert.equal(vouchHref("sam", VOUCH), `/u/sam/vouches#vouch-${VOUCH}`);
    assert.equal(vouchHref("@sam", VOUCH), `/u/sam/vouches#vouch-${VOUCH}`);
  });

  it("hides the vouch with the service role and marks the report actioned", async () => {
    const admin = fakeAdmin({ reports: [report("r1", "vouch", VOUCH, VOUCHER)], vouches: [vouchRow()] });
    assert.deepEqual(await hideReportedVouch("r1", asMod(admin)), {});
    const [hide, stamp] = admin.writes;
    assert.equal(hide?.table, "vouches");
    assert.deepEqual(Object.keys(hide!.row).sort(), ["hidden_at", "hidden_by"]);
    assert.equal(hide?.row.hidden_by, MOD);
    assert.deepEqual(hide?.filters, [`id=${VOUCH}`]);
    assert.equal(stamp?.table, "reports");
    assert.equal(stamp?.row.status, "actioned");
    assert.equal(stamp?.row.reviewed_by, MOD);
    assert.equal(admin.writes.length, 2, "nothing is deleted, and nothing else is touched");
  });

  it("takes a reply off by hiding it, leaving the vouch", async () => {
    const admin = fakeAdmin({ reports: [report("r2", "vouch_reply", VOUCH, SUBJECT)], vouches: [vouchRow()] });
    assert.deepEqual(await removeReportedVouchReply("r2", asMod(admin)), {});
    assert.deepEqual(Object.keys(admin.writes[0]!.row), ["reply_hidden_at"]);
    assert.deepEqual(admin.writes[0]?.filters, [`id=${VOUCH}`, "reply not is null"]);
    assert.equal(admin.writes[1]?.row.status, "actioned");
  });

  it("refuses the wrong kind of report, a vouch that is gone and a reply that is gone, changing nothing", async () => {
    const wrongKind = fakeAdmin({ reports: [report("r1", "post", "p1", VOUCHER), report("r2", "vouch", VOUCH, VOUCHER)], vouches: [vouchRow()] });
    assert.deepEqual(await hideReportedVouch("r1", asMod(wrongKind)), { error: "This report isn't about a vouch." });
    assert.deepEqual(await removeReportedVouchReply("r2", asMod(wrongKind)), { error: "This report isn't about a reply to a vouch." });
    assert.deepEqual(await hideReportedVouch("nope", asMod(wrongKind)), { error: "That report is gone." });
    assert.equal(wrongKind.writes.length, 0);

    const gone = fakeAdmin({ reports: [report("r1", "vouch", VOUCH, VOUCHER), report("r2", "vouch_reply", VOUCH_NO_REPLY, SUBJECT)], vouches: [vouchRow({ id: VOUCH_NO_REPLY, reply: null })] });
    assert.deepEqual(await hideReportedVouch("r1", asMod(gone)), { error: VOUCH_REPORT_GONE });
    assert.deepEqual(await removeReportedVouchReply("r2", asMod(gone)), { error: VOUCH_REPORT_GONE });
    assert.ok(!gone.writes.some((write) => write.table === "reports"), "the report is not marked actioned");
  });

  it("is not found for anyone who isn't a moderator", async () => {
    const admin = fakeAdmin({ reports: [report("r1", "vouch", VOUCH, VOUCHER)], vouches: [vouchRow()] });
    for (const getUserId of [async () => null, async () => REPORTER]) {
      await assert.rejects(hideReportedVouch("r1", { getUserId, createAdmin: () => admin.client, adminIds: MOD }));
      await assert.rejects(removeReportedVouchReply("r1", { getUserId, createAdmin: () => admin.client, adminIds: MOD }));
    }
    assert.equal(admin.writes.length, 0);
  });

  it("suspends the real author of a reported vouch, never the id the reporter sent", async () => {
    const ok = fakeAdmin({ reports: [report("r1", "vouch", VOUCH, VOUCHER)], vouches: [vouchRow()], posts: [] });
    assert.deepEqual(await suspendReportedUser("r1", asMod(ok)), {});
    assert.deepEqual(ok.bans, [VOUCHER]);

    const reply = fakeAdmin({ reports: [report("r1", "vouch_reply", VOUCH, SUBJECT)], vouches: [vouchRow()], posts: [] });
    assert.deepEqual(await suspendReportedUser("r1", asMod(reply)), {});
    assert.deepEqual(reply.bans, [SUBJECT], "a reply is the subject's");

    const forged = fakeAdmin({ reports: [report("r1", "vouch", VOUCH, SUBJECT)], vouches: [vouchRow()] });
    assert.deepEqual(await suspendReportedUser("r1", asMod(forged)), { error: SUSPEND_AUTHOR_MISMATCH });
    assert.deepEqual(forged.bans, []);

    const gone = fakeAdmin({ reports: [report("r1", "vouch", VOUCH, VOUCHER)], vouches: [] });
    assert.deepEqual(await suspendReportedUser("r1", asMod(gone)), { error: SUSPEND_VOUCH_GONE });
    assert.deepEqual(gone.bans, []);
  });
});

describe("the open reports list", () => {
  const page = readFileSync(join(process.cwd(), "app/(app)/admin/reports/page.tsx"), "utf8");
  const actions = readFileSync(join(process.cwd(), "components/report-actions.tsx"), "utf8");

  const tables = () => ({
    reports: [
      report("r1", "vouch", VOUCH, VOUCHER),
      report("r2", "vouch_reply", VOUCH, SUBJECT),
      report("r3", "vouch", uuid(404), VOUCHER),
      report("r4", "post", "p1", VOUCHER),
      report("r5", "user", VOUCHER, VOUCHER),
      report("r6", "vouch_reply", VOUCH_NO_REPLY, SUBJECT),
    ],
    vouches: [vouchRow(), vouchRow({ id: VOUCH_NO_REPLY, reply: null })],
    posts: [{ id: "p1", content: "A post" }],
    // The subject is in neither the reporter nor the reported column of r1: looked up separately.
    profiles,
  });
  const NOW = Date.parse("2026-11-28T12:00:00.000Z");

  it("is still moderators only", async () => {
    const admin = fakeAdmin(tables());
    await assert.rejects(loadOpenReports(NOW, { getUserId: async () => REPORTER, createAdmin: () => admin.client, adminIds: MOD }));
    assert.match(page, /adminAccess\(userId\) !== "allow"\) notFound\(\)/);
  });

  it("previews a vouch by its note and a reply by its text, links to the vouch, and offers the right action", async () => {
    const rows = await loadOpenReports(NOW, asMod(fakeAdmin(tables())));
    const by = (id: string) => rows.find((row) => row.id === id)!;
    assert.equal(by("r1").preview, "Card had a corner ding.");
    assert.equal(by("r1").href, `/u/sam/vouches#vouch-${VOUCH}`);
    assert.equal(by("r1").reported, "@kev");
    assert.deepEqual([by("r1").canHideVouch, by("r1").canRemoveVouchReply, by("r1").canDelete, by("r1").canModeratePost], [true, false, false, false]);
    assert.equal(by("r2").preview, "Refunded the difference.");
    assert.equal(by("r2").href, `/u/sam/vouches#vouch-${VOUCH}`);
    assert.equal(by("r2").reported, "@sam");
    assert.deepEqual([by("r2").canHideVouch, by("r2").canRemoveVouchReply], [false, true]);
  });

  it("shows a vouch that is gone, or a reply that is gone, as unavailable with no action", async () => {
    const rows = await loadOpenReports(NOW, asMod(fakeAdmin(tables())));
    const gone = rows.find((row) => row.id === "r3")!;
    assert.deepEqual([gone.preview, gone.href, gone.canHideVouch, gone.canRemoveVouchReply], [null, null, false, false]);
    const noReply = rows.find((row) => row.id === "r6")!;
    assert.deepEqual([noReply.preview, noReply.canRemoveVouchReply], [null, false]);
  });

  it("doesn't offer to hide what is already hidden", async () => {
    const data = tables();
    data.vouches = [vouchRow({ hidden_at: "2026-11-28T11:00:00Z", reply_hidden_at: "2026-11-28T11:00:00Z" })];
    const rows = await loadOpenReports(NOW, asMod(fakeAdmin(data)));
    assert.equal(rows.find((row) => row.id === "r1")?.canHideVouch, false);
    assert.equal(rows.find((row) => row.id === "r2")?.canRemoveVouchReply, false);
  });

  it("leaves post and user reports as they were", async () => {
    const rows = await loadOpenReports(NOW, asMod(fakeAdmin(tables())));
    const post = rows.find((row) => row.id === "r4")!;
    assert.deepEqual([post.preview, post.href, post.canModeratePost, post.canDelete, post.canHideVouch, post.canRemoveVouchReply], ["A post", "/posts/p1", true, true, false, false]);
    const user = rows.find((row) => row.id === "r5")!;
    assert.deepEqual([user.preview, user.href, user.canModeratePost, user.canDelete, user.canHideVouch], [null, "/u/kev", false, false, false]);
  });

  it("still loads when this database has no vouches table yet", async () => {
    const rows = await loadOpenReports(NOW, asMod(fakeAdmin(tables(), { vouchesMissing: true })));
    assert.equal(rows.length, 6);
    assert.deepEqual([rows[0]?.preview, rows[0]?.href, rows[0]?.canHideVouch], [null, null, false]);
    assert.equal(rows.find((row) => row.id === "r4")?.preview, "A post");
  });

  it("has the Hide vouch and Remove reply buttons, and keeps the old ones", () => {
    assert.match(actions, />\s*Hide vouch\s*</);
    assert.match(actions, />\s*Remove reply\s*</);
    for (const label of ["Mark reviewed", "Hide post", "Suspend account"]) assert.ok(actions.includes(label), label);
    assert.match(page, /canHideVouch=\{report\.canHideVouch\}/);
    assert.match(page, /canRemoveVouchReply=\{report\.canRemoveVouchReply\}/);
  });
});
