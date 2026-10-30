import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import { INVITE_STORAGE_KEY } from "@/lib/invites/attribution";
import type { PublicCollector } from "@/lib/invites/public-collector";
import type { Profile } from "@/lib/social/types";

const { win } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const replaced: string[] = [];
const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push() {},
  replace(href: string) {
    replaced.push(href);
  },
  prefetch() {},
};

const maya = {
  id: "user-maya",
  username: "maya",
  displayName: "Maya Chen",
  bio: "",
  avatarDataUrl: null,
  coverDataUrl: null,
  accent: "#7c5cff",
  createdAt: "2026-01-01T00:00:00Z",
  email: "",
} as Profile;

const newbie = { ...maya, id: "user-new", username: "newbie", displayName: "New Collector" } as Profile;

const collector: PublicCollector = {
  id: maya.id,
  username: "maya",
  displayName: "Maya Chen",
  avatarUrl: null,
  followerCount: 12,
  publicCardCount: 3,
  cards: [],
};

type Social = Record<string, unknown>;

function social(overrides: Social = {}): Social {
  return {
    ready: true,
    mode: "supabase",
    user: null,
    profiles: [maya],
    publicCards: [],
    blockedIds: [],
    followerCount: () => 0,
    isFollowing: () => false,
    toggleFollow: async () => ({}),
    refresh: async () => [],
    ...overrides,
  };
}

async function render(node: ReactNode, value: Social) {
  const { SocialContext } = await import("@/components/social-provider");
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(SocialContext.Provider, { value: value as never }, node),
      ),
    );
  });
  return () => {
    act(() => root.unmount());
    host.remove();
  };
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  replaced.length = 0;
  win.localStorage.clear();
  win.document.body.innerHTML = "";
});

describe("invite landing", () => {
  it("shows who invited you, joins through signup back to their profile, and remembers the invite", async () => {
    const { InviteLanding } = await import("@/components/invite/invite-landing");
    cleanup = await render(createElement(InviteLanding, { handle: "maya", collector }), social());
    const text = win.document.body.textContent ?? "";
    assert.match(text, /Maya Chen invited you to Slabhold/);
    assert.match(text, /@maya · 12 followers · 3 public cards/);
    const join = win.document.querySelector<HTMLAnchorElement>("[data-invite-join]");
    assert.equal(join?.textContent, "Join Maya on Slabhold");
    assert.equal(join?.getAttribute("href"), "/signup?next=%2Fu%2Fmaya");
    const saved = JSON.parse(win.localStorage.getItem(INVITE_STORAGE_KEY) ?? "{}");
    assert.equal(saved.username, "maya");
    assert.equal(saved.code, null, "no ?c= on the link: no code, so no follow-back later");
    assert.deepEqual(replaced, []);
  });

  it("remembers the inviter's code from ?c= with the handle", async () => {
    const { InviteLanding } = await import("@/components/invite/invite-landing");
    const code = "0123456789abcdef0123456789abcdef";
    cleanup = await render(createElement(InviteLanding, { handle: "maya", code, collector }), social());
    const saved = JSON.parse(win.localStorage.getItem(INVITE_STORAGE_KEY) ?? "{}");
    assert.deepEqual([saved.username, saved.code], ["maya", code]);
    const page = readFileSync(join(process.cwd(), "app/i/[username]/page.tsx"), "utf8");
    assert.match(page, /const code = inviteCode\(\(await searchParams\)\[INVITE_CODE_PARAM\]\);/);
    assert.match(page, /<InviteLanding handle=\{handle\} code=\{code\} collector=\{collector\} \/>/);
  });

  it("is the generic invite for an unknown, reserved or private handle, and remembers nothing", async () => {
    const { InviteLanding } = await import("@/components/invite/invite-landing");
    cleanup = await render(createElement(InviteLanding, { handle: "ghost", collector: null }), social());
    const text = win.document.body.textContent ?? "";
    assert.match(text, /You're invited to Slabhold/);
    assert.doesNotMatch(text, /Maya|followers/);
    assert.equal(win.document.querySelector("[data-invite-join]")?.getAttribute("href"), "/signup?next=%2F");
    assert.equal(win.localStorage.getItem(INVITE_STORAGE_KEY), null);
  });

  it("sends a signed-in visitor to the inviter's profile, where Follow is", async () => {
    const { InviteLanding } = await import("@/components/invite/invite-landing");
    cleanup = await render(createElement(InviteLanding, { handle: "maya", collector }), social({ user: newbie }));
    assert.deepEqual(replaced, ["/u/maya"]);
  });

  it("redirects on the server too, and is a full-screen page signed out", () => {
    const page = readFileSync(join(process.cwd(), "app/i/[username]/page.tsx"), "utf8");
    assert.match(page, /if \(collector && \(await getAuthUserId\(\)\)\) redirect\(userHref\(collector\.username\)\)/);
    const shell = readFileSync(join(process.cwd(), "components/app-shell.tsx"), "utf8");
    assert.match(shell, /if \(!user && isInvitePage\(pathname\)\)/);
  });
});

describe("after signing up through an invite", () => {
  it("offers Follow when the RPC isn't there (local mode), and clears the invite", async () => {
    const { InviteWelcome } = await import("@/components/invite/invite-welcome");
    win.localStorage.setItem(INVITE_STORAGE_KEY, JSON.stringify({ username: "maya", savedAt: Date.now() }));
    cleanup = await render(createElement(InviteWelcome), social({ mode: "local", user: newbie }));
    await settle();
    const note = win.document.querySelector("[data-invite-welcome]");
    assert.equal(note?.getAttribute("data-invite-welcome"), "prompt");
    assert.match(note?.textContent ?? "", /Maya Chen invited you/);
    assert.ok([...(note?.querySelectorAll("button") ?? [])].some((button) => button.textContent === "Follow"));
    assert.equal(win.localStorage.getItem(INVITE_STORAGE_KEY), null);
  });

  it("says nothing without a remembered invite", async () => {
    const { InviteWelcome } = await import("@/components/invite/invite-welcome");
    cleanup = await render(createElement(InviteWelcome), social({ mode: "local", user: newbie }));
    await settle();
    assert.equal(win.document.querySelector("[data-invite-welcome]"), null);
  });

  it("confirms the follow-back after the RPC, and Undo unfollows", async () => {
    const accept = readFileSync(join(process.cwd(), "lib/invites/accept.ts"), "utf8");
    assert.match(accept, /supabase\.rpc\("accept_invite", \{ inviter_username: username, code \}\)/);
    const welcome = readFileSync(join(process.cwd(), "components/invite/invite-welcome.tsx"), "utf8");
    assert.match(welcome, /await acceptInvite\(supabase, handle, invite\.code\)/);
    assert.match(welcome, /You&apos;re following <b className="font-bold">\{name\}<\/b>, and they follow you back\./);
    assert.match(welcome, /if \(isFollowing\(inviter\.id\)\) void toggleFollow\(inviter\.id\);/);
    const { InviteWelcomeNote } = await import("@/components/invite/invite-welcome");
    let undone = 0;
    cleanup = await render(
      createElement(InviteWelcomeNote, {
        outcome: "mutual",
        inviter: { id: maya.id, username: "maya", displayName: "Maya Chen", avatarUrl: null },
        onUndo: () => undone++,
        onDismiss: () => {},
      }),
      social({ user: newbie }),
    );
    const note = win.document.querySelector("[data-invite-welcome]");
    assert.equal(note?.textContent?.includes("You're following Maya Chen, and they follow you back."), true);
    const undo = [...(note?.querySelectorAll("button") ?? [])].find((button) => button.textContent === "Undo");
    await act(async () => undo?.click());
    assert.equal(undone, 1);
    // The key is cleared before the RPC runs, so it's used once.
    assert.ok(welcome.indexOf("clearInvite(store)") < welcome.indexOf("await acceptInvite("));
    const setup = readFileSync(join(process.cwd(), "components/onboarding/first-run-setup.tsx"), "utf8");
    assert.match(setup, /<InviteWelcome \/>/);
  });

  it("without a follow-back, says only that you follow them, with Undo", async () => {
    const { InviteWelcomeNote } = await import("@/components/invite/invite-welcome");
    let undone = 0;
    cleanup = await render(
      createElement(InviteWelcomeNote, {
        outcome: "following",
        inviter: { id: maya.id, username: "maya", displayName: "Maya Chen", avatarUrl: null },
        onUndo: () => undone++,
        onDismiss: () => {},
      }),
      social({ user: newbie }),
    );
    const note = win.document.querySelector("[data-invite-welcome]");
    assert.equal(note?.getAttribute("data-invite-welcome"), "following");
    assert.equal(note?.textContent?.includes("You're following Maya Chen."), true);
    assert.equal(note?.textContent?.includes("follow you back"), false);
    const undo = [...(note?.querySelectorAll("button") ?? [])].find((button) => button.textContent === "Undo");
    await act(async () => undo?.click());
    assert.equal(undone, 1);
  });
});

describe("invite a collector", () => {
  it("shares the invite link with the native sheet", async () => {
    const shared: unknown[] = [];
    Object.defineProperty(win.navigator, "share", {
      configurable: true,
      value: async (data: unknown) => {
        shared.push(data);
      },
    });
    const { InviteButton } = await import("@/components/invite/invite-button");
    cleanup = await render(createElement(InviteButton, { username: "maya", className: "" }), social({ user: maya }));
    try {
      await act(async () => {
        win.document.querySelector<HTMLButtonElement>("[data-invite-button]")?.click();
      });
    } finally {
      delete (win.navigator as { share?: unknown }).share;
    }
    assert.deepEqual(shared, [
      {
        title: "Invite a collector",
        text: "Join me on Slabhold, the home for your card collection",
        url: "https://slabhold.app/i/maya?ref=share",
      },
    ]);
  });

  it("falls back to our sheet with Post on X and Copy link, and toasts the copy", async () => {
    Object.defineProperty(win.navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => {} },
    });
    const { InviteButton } = await import("@/components/invite/invite-button");
    cleanup = await render(createElement(InviteButton, { username: "maya", className: "" }), social({ user: maya }));
    await act(async () => {
      win.document.querySelector<HTMLButtonElement>("[data-invite-button]")?.click();
    });
    const dialog = win.document.querySelector('[role="dialog"]');
    assert.ok(dialog, "share sheet");
    const x = [...dialog.querySelectorAll("a")].find((link) => link.textContent?.includes("Post on X"));
    assert.match(x?.getAttribute("href") ?? "", /^https:\/\/x\.com\/intent\/post\?text=Join%20me%20on%20Slabhold/);
    const copy = [...dialog.querySelectorAll("button")].find((button) => button.textContent?.includes("Copy link"));
    await act(async () => {
      copy?.click();
    });
    await settle();
    assert.equal(win.document.querySelector("[data-share-toast]")?.textContent, "Link copied");
  });

  it("carries your invite code on the link once it has loaded", async () => {
    const { inviteTarget } = await import("@/components/invite/invite-button");
    const code = "0123456789abcdef0123456789abcdef";
    assert.equal(inviteTarget("maya", code).path, `/i/maya?c=${code}`);
    assert.equal(inviteTarget("maya").path, "/i/maya");
    const button = readFileSync(join(process.cwd(), "components/invite/invite-button.tsx"), "utf8");
    assert.match(button, /const \{ code \} = useInviteCode\(\);\s*return useShareSheet\(inviteTarget\(username, code\)\);/);
    assert.match(button, /fetchInviteCode\(createSupabaseBrowser\(\)\)/);
  });

  it("is in the side menu and on your own profile only", () => {
    const menu = readFileSync(join(process.cwd(), "components/side-menu.tsx"), "utf8");
    assert.match(menu, /item\.href === INVITE_MENU_HREF/);
    assert.match(menu, /void invite\.share\(\);\s*onClose\(\);/);
    const profile = readFileSync(join(process.cwd(), "components/profile-view.tsx"), "utf8");
    const own = profile.slice(profile.indexOf("{isOwn ? ("), profile.indexOf("Edit profile"));
    assert.match(own, /<InviteButton username=\{profile\.username\}/);
    assert.equal(profile.match(/<InviteButton/g)?.length, 1);
    assert.match(profile, /\{isOwn \? \(\s*<div className="mt-3">\s*<ShareCollectionCard \/>/);
    assert.match(readFileSync(join(process.cwd(), "components/dashboard.tsx"), "utf8"), /<ShareCollectionCard \/>/);
  });
});

describe("public collection page", () => {
  it("is the generic page for a private or unknown collector", async () => {
    const { PublicCollection } = await import("@/components/invite/public-collection");
    cleanup = await render(createElement(PublicCollection, { handle: "ghost", collector: null }), social());
    const text = win.document.body.textContent ?? "";
    assert.match(text, /Collections live on Slabhold/);
    assert.equal(win.document.querySelector("[data-public-collection]"), null);
  });

  it("shows the count and handle, a designed empty state, and Join through the invite", async () => {
    const { PublicCollection } = await import("@/components/invite/public-collection");
    cleanup = await render(
      createElement(PublicCollection, { handle: "maya", collector: { ...collector, publicCardCount: 0 } }),
      social(),
    );
    const text = win.document.body.textContent ?? "";
    assert.match(text, /0 cards/);
    assert.match(text, /@maya/);
    assert.match(text, /No public cards yet/);
    assert.equal(win.document.querySelector("[data-collection-join]")?.getAttribute("href"), "/i/maya");
  });
});
