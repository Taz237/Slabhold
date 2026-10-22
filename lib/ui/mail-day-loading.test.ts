import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Mail Day loading", () => {
  it("shows the heading, intro, and skeleton before the form data", () => {
    const pending = read("components/mail-day-pending.tsx");
    const loading = read("app/mail-day/loading.tsx");
    const form = read("components/mail-day-form.tsx");
    const page = read("app/mail-day/page.tsx");
    const shell = read("components/app-shell.tsx");

    assert.match(pending, /<h1 className="mt-1 text-2xl font-bold tracking-tight">Add a card<\/h1>/);
    assert.doesNotMatch(pending, />[^<{]*Mail Day/);
    assert.match(pending, /Add today&apos;s pickups/);
    assert.match(pending, /animate-pulse/);
    assert.match(pending, /aria-busy="true"/);
    assert.match(loading, /MailDayPending/);
    assert.doesNotMatch(loading, /getAuthUserId/);

    assert.match(form, /MailDayHeading/);
    assert.match(form, /if \(!ready\) return <MailDayPending \/>/);
    assert.match(page, /redirect\("\/cards\/new"\)/);
    assert.doesNotMatch(page, /loginPath\("\/mail-day"\)/);
    assert.doesNotMatch(page, /MailDayForm/);

    assert.match(shell, /requiresAccount\(pathname\)/);
    assert.match(shell, /routeAccess\(pathname\) === "unknown"/);
    assert.doesNotMatch(shell, /path === "\/mail-day"/);
  });
});