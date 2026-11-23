import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SIGNUP_SOURCE_WINDOW_DAYS, loadSignupSources, summarizeSignupSources } from "./signup-sources";

const NOW = Date.UTC(2026, 10, 22, 12);
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(NOW - days * DAY).toISOString();

describe("signups by source", () => {
  it("counts the last 30 days by source and platform, invite and campaign rows first", () => {
    const rows = summarizeSignupSources(
      [
        { created_at: at(1), user_metadata: { signup_source: "invite", invite_from: "maya", signup_platform: "web" } },
        { created_at: at(2), user_metadata: { signup_source: "invite", invite_from: "maya", signup_platform: "ios-app" } },
        { created_at: at(3), user_metadata: { signup_source: "utm", utm_source: "tiktok", signup_platform: "web" } },
        { created_at: at(4), user_metadata: { signup_source: "direct", signup_platform: "ios-app" } },
        { created_at: at(5), user_metadata: { username: "old_account" } },
        { created_at: at(SIGNUP_SOURCE_WINDOW_DAYS + 1), user_metadata: { signup_source: "direct", signup_platform: "web" } },
      ],
      NOW,
    );
    assert.deepEqual(rows, [
      { label: "Invite", web: 1, ios: 1, total: 2 },
      { label: "Campaign: tiktok", web: 1, ios: 0, total: 1 },
      { label: "Direct", web: 0, ios: 1, total: 1 },
      { label: "Not recorded", web: 0, ios: 0, total: 1 },
    ]);
  });

  it("is empty with no signups, and ignores junk", () => {
    assert.deepEqual(summarizeSignupSources([], NOW), []);
    assert.deepEqual(summarizeSignupSources([{ created_at: "nope", user_metadata: null }], NOW), []);
  });

  it("reads auth users through the admin client, a page at a time, and nothing else", async () => {
    const pages: number[] = [];
    const admin = {
      auth: {
        admin: {
          async listUsers({ page, perPage }: { page: number; perPage: number }) {
            pages.push(page);
            const users =
              page === 1
                ? Array.from({ length: perPage }, () => ({ created_at: at(1), user_metadata: { signup_source: "direct" } }))
                : [{ created_at: at(1), user_metadata: { signup_source: "invite" } }];
            return { data: { users }, error: null };
          },
        },
      },
    };
    const result = await loadSignupSources(admin as never, NOW);
    assert.deepEqual(pages, [1, 2]);
    assert.equal(result.status, "ready");
    assert.equal(result.status === "ready" ? result.rows.reduce((sum, row) => sum + row.total, 0) : 0, 1001);
  });

  it("says unavailable without the admin client or on an error", async () => {
    assert.deepEqual(await loadSignupSources(null, NOW), { status: "unavailable" });
    const failing = { auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: { message: "x" } }) } } };
    assert.deepEqual(await loadSignupSources(failing as never, NOW), { status: "unavailable" });
  });
});
