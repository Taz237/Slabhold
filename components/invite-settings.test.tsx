import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResetLinkSheet, displayInviteLink } from "@/components/invite/invite-settings";
import { resetNotice } from "@/lib/invites/code";
import { SIDE_MENU_SETTINGS } from "@/lib/ui/side-menu";

const CODE = "0123456789abcdef0123456789abcdef";
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Settings > Invite friends", () => {
  it("is a settings page in the side menu", () => {
    assert.ok(SIDE_MENU_SETTINGS.some((item) => item.href === "/settings/invite" && item.label === "Invite friends"));
    assert.match(read("app/(app)/settings/invite/page.tsx"), /<InviteSettings \/>/);
  });

  it("shows the link with its code, without the scheme", () => {
    assert.equal(displayInviteLink("maya", CODE), `slabhold.app/i/maya?c=${CODE}`);
    assert.equal(displayInviteLink("maya", null), "slabhold.app/i/maya");
  });

  it("asks before the old link stops working, with 44px buttons", () => {
    const html = renderToStaticMarkup(createElement(ResetLinkSheet, { busy: false, onCancel: () => {}, onConfirm: () => {} }));
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /Get a new link\?/);
    assert.match(html, /stops working right away/);
    assert.match(html, />Cancel</);
    assert.match(html, />Get new link</);
    assert.equal(html.match(/min-h-11/g)?.length, 2);
    const busy = renderToStaticMarkup(createElement(ResetLinkSheet, { busy: true, onCancel: () => {}, onConfirm: () => {} }));
    assert.match(busy, /Getting link…/);
    assert.equal(busy.match(/disabled=""/g)?.length, 2);
  });

  it("says what happened after a reset", () => {
    assert.equal(resetNotice({ kind: "ok", code: CODE }), "New link ready. Your old link no longer works.");
    assert.equal(resetNotice({ kind: "limit" }), "You can get a new link 3 times a day. Try again tomorrow.");
    assert.equal(resetNotice({ kind: "missing" }), "New links aren't available yet.");
    assert.equal(resetNotice({ kind: "failed" }), "Couldn't get a new link. Try again.");
  });

  it("swaps the code everywhere on the page after a reset, so the old link is never shared again", () => {
    const settings = read("components/invite/invite-settings.tsx");
    assert.match(settings, /resetInviteCode\(await loadSupabaseBrowser\(\)\)/);
    assert.match(settings, /if \(result\.kind === "ok"\) replaceInviteCode\(user\.id, result\.code\)/);
    const button = read("components/invite/invite-button.tsx");
    assert.match(button, /export function replaceInviteCode/);
    assert.match(button, /useSyncExternalStore\(subscribe/);
  });
});
