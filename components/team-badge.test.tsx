import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";

const { win } = installDom();

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("TeamBadge", () => {
  it("draws for listed usernames only", async () => {
    const { TeamBadge } = await import("@/components/team-badge");
    for (const username of ["donnietaz", "slabhold", "ripsandlots", "kevstuff", "DonnieTaz"]) {
      const html = renderToStaticMarkup(createElement(TeamBadge, { username }));
      assert.match(html, /data-team-badge=""/, username);
      assert.match(html, /aria-label="Slabhold team"/);
      assert.match(html, /<button/);
    }
    for (const username of ["collector", "slabholdupdates", "donnietaz2", "ripsandlots2", "kevstuffs", "", null]) {
      assert.equal(renderToStaticMarkup(createElement(TeamBadge, { username })), "", String(username));
    }
  });

  it("stays off an account that already has the official mark", async () => {
    const { TeamBadge } = await import("@/components/team-badge");
    assert.equal(renderToStaticMarkup(createElement(TeamBadge, { username: "slabhold", official: true })), "");
  });

  it("is a labelled image, not a nested button, inside a link", async () => {
    const { TeamBadge } = await import("@/components/team-badge");
    const html = renderToStaticMarkup(createElement(TeamBadge, { username: "slabhold", inLink: true }));
    assert.match(html, /<span[^>]*role="img"[^>]*aria-label="Slabhold team"/);
    assert.doesNotMatch(html, /<button/);
  });

  it("shows a small Slabhold team tip on tap, without following the link around it", async () => {
    const { TeamBadge } = await import("@/components/team-badge");
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    let followed = 0;
    await act(async () =>
      root.render(
        createElement(
          "a",
          { href: "/u/slabhold", onClick: () => (followed += 1) },
          "Slabhold",
          createElement(TeamBadge, { username: "slabhold", inLink: true }),
        ),
      ),
    );
    cleanup = () => {
      act(() => root.unmount());
      host.remove();
    };
    assert.equal(win.document.querySelector('[role="tooltip"]'), null);
    const badge = host.querySelector("[data-team-badge]")!;
    const click = new win.MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => {
      badge.dispatchEvent(click);
    });
    assert.equal(click.defaultPrevented, true);
    assert.equal(followed, 0);
    assert.equal(win.document.querySelector('[role="tooltip"]')?.textContent, "Slabhold team");
  });

  it("puts the badge after the name in posts, replies and quotes", async () => {
    const { AuthorLine } = await import("@/components/tweet");
    const line = (username: string, official = false) =>
      renderToStaticMarkup(
        createElement(AuthorLine, { name: "Name", username, href: `/u/${username}`, createdAt: "", official }),
      );
    const team = line("donnietaz");
    assert.match(team, />Name<\/a><button[^>]*data-team-badge/);
    assert.doesNotMatch(line("collector"), /data-team-badge/);
    const official = line("slabhold", true);
    assert.match(official, /data-official-mark/);
    assert.doesNotMatch(official, /data-team-badge/, "no double badge");
  });

  it("is wired into every place a display name is drawn", () => {
    const surfaces = [
      "components/tweet.tsx", // feeds, post detail, replies (AuthorLine) and reply previews
      "components/quoted-post-embed.tsx",
      "components/profile-view.tsx",
      "components/search-view.tsx",
      "components/follow-list.tsx",
      "components/collector-suggestions.tsx",
      "components/notifications-view.tsx",
      "components/messages-view.tsx",
      "components/message-thread.tsx",
      "components/new-message-sheet.tsx",
      "components/send-post-sheet-view.tsx",
    ];
    for (const path of surfaces) assert.match(read(path), /<TeamBadge\b/, path);
  });

  it("decides who wears it from one list, with no database column", () => {
    assert.match(read("lib/social/team-badge.ts"), /TEAM_BADGE_USERNAMES[^=]*= \["donnietaz", "slabhold", "ripsandlots", "kevstuff"\]/);
    assert.doesNotMatch(read("components/team-badge.tsx"), /supabase|\.from\(/);
  });
});
