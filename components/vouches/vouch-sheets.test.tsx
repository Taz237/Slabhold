import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { installDom } from "@/lib/test/dom";
import type { SocialContextValue } from "@/components/social-provider";
import { chatRefusal, localVouchBackend } from "@/lib/vouches/local";
import { hasConfirmedDealWith } from "@/lib/vouches/page";
import { VOUCH_COPY, VOUCH_HINTS, vouchHintCopy, type VouchRating } from "@/lib/vouches/rules";
import { vouchNoticeIcon } from "@/lib/social/notification-copy";
import type { VouchStatus, VouchWriteResult } from "@/lib/vouches/types";

const { win } = installDom();

// react-dom reads the DOM when it loads, so it and the components load after installDom.
let createRoot: typeof import("react-dom/client").createRoot;
let SocialContext: typeof import("@/components/social-provider").SocialContext;
let VouchSheet: typeof import("@/components/vouches/vouch-sheets").VouchSheet;
let VouchReplySheet: typeof import("@/components/vouches/vouch-sheets").VouchReplySheet;
let VouchThreadBarRow: typeof import("@/components/vouches/vouch-thread-bar-view").VouchThreadBarRow;
let vouchBarAction: typeof import("@/components/vouches/vouch-thread-bar-view").vouchBarAction;
let VouchRowItem: typeof import("@/components/vouches/vouches-page").VouchRowItem;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ SocialContext } = await import("@/components/social-provider"));
  ({ VouchSheet, VouchReplySheet } = await import("@/components/vouches/vouch-sheets"));
  ({ VouchThreadBarRow, vouchBarAction } = await import("@/components/vouches/vouch-thread-bar-view"));
  ({ VouchRowItem } = await import("@/components/vouches/vouches-page"));
});

const ME = { id: "me", username: "donnie", displayName: "Donnie T" };
const KEV = { id: "kev", username: "kev" };

function social(): SocialContextValue {
  return { mode: "local", ready: true, user: ME, profiles: [], messages: [], blockedIds: [], mutedIds: [], followingOf: () => [] } as unknown as SocialContextValue;
}

let host: HTMLDivElement;
let root: Root | null = null;
beforeEach(() => {
  host = win.document.createElement("div");
  win.document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host.remove();
});

function mount(element: ReactNode) {
  act(() => root!.render(createElement(SocialContext.Provider, { value: social() }, element)));
}
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 5))));
const $ = <T extends Element = HTMLElement>(selector: string) => host.querySelector<T>(selector);
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === label);
const radio = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("[role='radio']")].find((node) => node.textContent?.trim() === label)!;
const click = (node: Element | null | undefined) => {
  assert.ok(node, "the control is there");
  act(() => (node as HTMLElement).click());
};
function type(value: string) {
  const area = $<HTMLTextAreaElement>("textarea")!;
  const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(area, value);
    area.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
}

function fakeWrites(answer: VouchWriteResult = { ok: true, id: "v1" }) {
  const calls: unknown[][] = [];
  return {
    calls,
    upsert: async (subjectId: string, rating: VouchRating, note: string) => {
      calls.push(["upsert", subjectId, rating, note]);
      return answer;
    },
    remove: async (subjectId: string) => {
      calls.push(["remove", subjectId]);
      return answer;
    },
    reply: async (vouchId: string, text: string) => {
      calls.push(["reply", vouchId, text]);
      return answer;
    },
  };
}

describe("vouch sheet", () => {
  it("is a labelled dialog with the brief's copy and three rating choices as a radio group", () => {
    mount(createElement(VouchSheet, { subject: KEV, onClose: () => {}, writes: fakeWrites() }));
    const dialog = $("[role='dialog']")!;
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(win.document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent, "Vouch for @kev");
    assert.ok(host.textContent?.includes("How did your deal go?"));
    assert.ok(host.textContent?.includes("Everyone can see this on @kev's profile."));
    assert.equal($<HTMLTextAreaElement>("textarea")?.placeholder, "What happened? e.g. Shipped fast, card as shown.");
    const group = $("[role='radiogroup']")!;
    assert.ok(group.getAttribute("aria-label"));
    const radios = [...group.querySelectorAll("[role='radio']")];
    assert.deepEqual(radios.map((node) => node.textContent), ["Positive", "Neutral", "Negative"]);
    assert.ok(radios.every((node) => node.getAttribute("aria-checked") === "false" && node.querySelector("svg") && /min-h-\[4\.5rem\]/.test(node.className)));
    assert.equal(button("Post vouch")?.disabled, true, "nothing to post until a rating is picked");
  });

  it("picks a rating by tap or arrow key, and marks it in purple", () => {
    mount(createElement(VouchSheet, { subject: KEV, onClose: () => {}, writes: fakeWrites() }));
    click(radio("Positive"));
    assert.equal(radio("Positive").getAttribute("aria-checked"), "true");
    assert.match(radio("Positive").className, /border-violet-600/);
    assert.doesNotMatch(radio("Neutral").className, /violet/);
    assert.equal(button("Post vouch")?.disabled, false, "positive needs no note");
    act(() => radio("Positive").dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    assert.equal(radio("Neutral").getAttribute("aria-checked"), "true");
    assert.equal(radio("Positive").getAttribute("aria-checked"), "false");
    assert.equal(win.document.activeElement, radio("Neutral"));
    act(() => radio("Neutral").dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    assert.equal(radio("Positive").getAttribute("aria-checked"), "true");
    assert.deepEqual([radio("Positive").tabIndex, radio("Neutral").tabIndex], [0, -1], "one tab stop, like a radio group");
  });

  it("asks neutral and negative for a short reason, as a helper and not an error", () => {
    mount(createElement(VouchSheet, { subject: KEV, onClose: () => {}, writes: fakeWrites() }));
    click(radio("Negative"));
    assert.ok(host.textContent?.includes("Add a short reason so others know what happened."));
    assert.equal(button("Post vouch")?.disabled, true);
    assert.equal($("[role='alert']"), null);
    type("too short");
    assert.equal(button("Post vouch")?.disabled, true, "9 characters");
    type("Corner ding.");
    assert.equal(button("Post vouch")?.disabled, false);
    click(radio("Positive"));
    assert.ok(!host.textContent?.includes("Add a short reason"), "positive drops the helper");
  });

  it("counts live, a line break as one character, and stops the post past 280", () => {
    mount(createElement(VouchSheet, { subject: KEV, onClose: () => {}, writes: fakeWrites() }));
    click(radio("Positive"));
    assert.ok(host.textContent?.includes("0/280"));
    type("ab\r\ncd");
    assert.ok(host.textContent?.includes("5/280"), host.textContent ?? "");
    assert.ok(host.textContent?.includes("5 of 280 characters"), "read out in full for screen readers");
    type("x".repeat(281));
    assert.ok(host.textContent?.includes("281/280"));
    assert.ok(host.textContent?.includes("Keep it to 280 characters."));
    assert.equal(button("Post vouch")?.disabled, true);
    assert.equal($("textarea")?.getAttribute("aria-invalid"), "true");
    type("tab\tinside");
    assert.ok(host.textContent?.includes("Remove the special characters and try again."));
    assert.equal(button("Post vouch")?.disabled, true);
  });

  it("posts once, trimmed by the store, then closes", async () => {
    const writes = fakeWrites();
    let closed = 0;
    let saved = 0;
    mount(createElement(VouchSheet, { subject: KEV, onClose: () => (closed += 1), onSaved: () => (saved += 1), writes }));
    click(radio("Neutral"));
    type("Slow to ship, but it arrived.");
    click(button("Post vouch"));
    click(button("Saving…"));
    await settle();
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 400))));
    assert.deepEqual(writes.calls, [["upsert", "kev", "neutral", "Slow to ship, but it arrived."]]);
    assert.equal(saved, 1);
    assert.equal(closed, 1);
  });

  it("shows the database's refusal in plain words with their handle, and stays open", async () => {
    const writes = fakeWrites({ ok: false, error: "raw", hint: "vouch_too_new_subject" });
    let closed = 0;
    mount(createElement(VouchSheet, { subject: KEV, onClose: () => (closed += 1), writes }));
    click(radio("Positive"));
    click(button("Post vouch"));
    await settle();
    assert.equal($("[role='alert']")?.textContent, "@kev's account needs to be 7 days old to get vouches.");
    assert.equal(closed, 0);
    assert.equal(button("Post vouch")?.disabled, false, "they can try again");
  });

  it("every hint the database can send reads as a sentence here, never a code", () => {
    for (const hint of VOUCH_HINTS) {
      const copy = vouchHintCopy(hint, "kev");
      assert.doesNotMatch(copy, /vouch_|\{|undefined/, hint);
      assert.match(copy, /^[A-Z@].*\.$/, hint);
    }
  });

  it("opens on your own vouch to edit it: Save changes, off until something changes", async () => {
    const writes = fakeWrites();
    mount(createElement(VouchSheet, { subject: KEV, mine: { id: "v1", rating: "positive", note: "Shipped fast." }, onClose: () => {}, writes }));
    assert.equal(radio("Positive").getAttribute("aria-checked"), "true");
    assert.equal($<HTMLTextAreaElement>("textarea")?.value, "Shipped fast.");
    assert.equal(button("Post vouch"), undefined);
    assert.equal(button("Save changes")?.disabled, true);
    type("Shipped fast, card as shown.");
    assert.equal(button("Save changes")?.disabled, false);
    click(button("Save changes"));
    await settle();
    assert.deepEqual(writes.calls, [["upsert", "kev", "positive", "Shipped fast, card as shown."]]);
  });

  it("removes only after a second, explicit tap", async () => {
    const writes = fakeWrites();
    mount(createElement(VouchSheet, { subject: KEV, mine: { id: "v1", rating: "positive", note: "" }, onClose: () => {}, writes }));
    click(button("Remove vouch"));
    assert.deepEqual(writes.calls, [], "the first tap only asks");
    const confirm = $("[role='alertdialog']")!;
    assert.ok(confirm.textContent?.includes("Remove this vouch?"));
    click([...confirm.querySelectorAll("button")].find((node) => node.textContent === "Cancel"));
    assert.equal($("[role='alertdialog']"), null);
    assert.deepEqual(writes.calls, []);
    click(button("Remove vouch"));
    click([...$("[role='alertdialog']")!.querySelectorAll("button")].find((node) => node.textContent === "Remove vouch"));
    await settle();
    assert.deepEqual(writes.calls, [["remove", "kev"]]);
  });

  it("there is no Remove on a new vouch", () => {
    mount(createElement(VouchSheet, { subject: KEV, onClose: () => {}, writes: fakeWrites() }));
    assert.equal(button("Remove vouch"), undefined);
  });

  it("shows the Logged deal tag when the two logged a deal, as a fact and not a switch", () => {
    mount(createElement(VouchSheet, { subject: KEV, hasLoggedDeal: true, onClose: () => {}, writes: fakeWrites() }));
    assert.ok(host.textContent?.includes("You logged a deal with @kev, so this vouch gets a Logged deal tag."));
    assert.equal(host.querySelector("input[type='checkbox'], [role='switch']"), null);
    assert.equal(hasConfirmedDealWith([{ sellerId: "me", buyerId: "kev", status: "confirmed" }], "me", "kev"), true);
    assert.equal(hasConfirmedDealWith([{ sellerId: "kev", buyerId: "me", status: "confirmed" }], "me", "kev"), true);
    assert.equal(hasConfirmedDealWith([{ sellerId: "me", buyerId: "kev", status: "pending" }], "me", "kev"), false);
    assert.equal(hasConfirmedDealWith([{ sellerId: "me", buyerId: "sam", status: "confirmed" }], "me", "kev"), false);
  });

  it("closes on Escape, takes focus when it opens and gives it back", async () => {
    const opener = win.document.createElement("button");
    win.document.body.appendChild(opener);
    opener.focus();
    let closed = 0;
    mount(createElement(VouchSheet, { subject: KEV, onClose: () => (closed += 1), writes: fakeWrites() }));
    assert.equal(win.document.activeElement, $("[role='dialog']"));
    act(() => win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 400))));
    assert.equal(closed, 1);
    act(() => root!.unmount());
    root = null;
    assert.equal(win.document.activeElement, opener);
    opener.remove();
  });

  it("uses the app's sheet: slide, swipe down, focus trap, keyboard, and no motion when asked", () => {
    const source = readFileSync(join(process.cwd(), "components/vouches/vouch-sheets.tsx"), "utf8");
    for (const piece of ["useSheetDrag(", "useFocusTrap(", "useKeyboardInset(", "sheet-slide", "backdrop-in", "env(safe-area-inset-bottom)", "prefers-reduced-motion: reduce", "motion-reduce:transition-none"]) {
      assert.ok(source.includes(piece), piece);
    }
    assert.doesNotMatch(source, /animate-(spin|pulse|ping|bounce)|transition-all|teal|cyan/);
    const lazy = readFileSync(join(process.cwd(), "components/vouches/vouch-sheet.tsx"), "utf8");
    assert.match(lazy, /lazyPart<VouchSheetProps>\(\(\) => import\("@\/components\/vouches\/vouch-sheets"\)/);
    assert.match(lazy, /lazyPart<VouchReplySheetProps>/);
  });
});

describe("the Terms link in the vouch sheet", () => {
  const termsLink = () => [...host.querySelectorAll<HTMLAnchorElement>("a")].find((node) => node.textContent === "Deals between collectors, in our Terms");

  it("is there on a new vouch, on an edit, and stays while Remove asks to confirm", () => {
    mount(createElement(VouchSheet, { subject: KEV, onClose: () => {}, writes: fakeWrites() }));
    assert.equal(termsLink()?.getAttribute("href"), "/terms#deals");
    assert.match(termsLink()!.className, /min-h-11/);
    act(() => root!.unmount());
    root = createRoot(host);
    mount(createElement(VouchSheet, { subject: KEV, mine: { id: "v1", rating: "positive", note: "" }, onClose: () => {}, writes: fakeWrites() }));
    assert.equal(termsLink()?.getAttribute("href"), "/terms#deals");
    click(button("Remove vouch"));
    assert.equal(termsLink()?.getAttribute("href"), "/terms#deals");
  });

  it("the bar's not-yet line in a real row reads the 24-hour rule for someone who hasn't had a reply", () => {
    mount(createElement(VouchThreadBarRow, { partner: KEV, status: { canVouch: false, reason: "vouch_no_conversation", mine: null }, onVouch: () => {} }));
    const bar = $("[data-vouch-bar]")!;
    assert.ok(bar.textContent?.includes("You can vouch 24 hours after you've both messaged."));
    assert.ok(!bar.textContent?.includes("sent each other a message"));
  });
});

describe("reply sheet", () => {
  const vouch = { id: "v1", note: "Corner ding that wasn't in the photos.", reply: null as string | null };

  it("quotes the vouch, takes up to 280 characters, and posts the reply", async () => {
    const writes = fakeWrites();
    let saved: (string | null)[] = [];
    mount(createElement(VouchReplySheet, { vouch, voucherUsername: "kev", onClose: () => {}, onSaved: (reply) => (saved = [...saved, reply]), writes }));
    assert.ok(host.textContent?.includes("Reply to this vouch"));
    assert.ok(host.textContent?.includes("@kev: Corner ding that wasn't in the photos."));
    assert.equal(button("Post reply")?.disabled, true, "an empty reply posts nothing");
    type("x".repeat(281));
    assert.equal(button("Post reply")?.disabled, true);
    assert.ok(host.textContent?.includes("281/280"));
    type("  Refunded the difference.\r\nSame day.  ");
    click(button("Post reply"));
    await settle();
    // (A textarea hands line breaks over as "\n"; the store trims before it sends.)
    assert.deepEqual(writes.calls, [["reply", "v1", "  Refunded the difference.\nSame day.  "]]);
    assert.deepEqual(saved, ["Refunded the difference.\nSame day."]);
    assert.equal(button("Remove reply"), undefined, "nothing to remove before there is a reply");
  });

  it("edits the reply, and removes it only after a second tap", async () => {
    const writes = fakeWrites();
    const saved: (string | null)[] = [];
    mount(createElement(VouchReplySheet, { vouch: { ...vouch, reply: "Refunded." }, voucherUsername: "kev", onClose: () => {}, onSaved: (reply) => void saved.push(reply), writes }));
    assert.equal($<HTMLTextAreaElement>("textarea")?.value, "Refunded.");
    assert.equal(button("Save changes")?.disabled, true);
    click(button("Remove reply"));
    assert.deepEqual(writes.calls, []);
    assert.ok($("[role='alertdialog']")?.textContent?.includes("Remove your reply?"));
    click([...$("[role='alertdialog']")!.querySelectorAll("button")].find((node) => node.textContent === "Remove reply"));
    await settle();
    assert.deepEqual(writes.calls, [["reply", "v1", ""]]);
    assert.deepEqual(saved, [null]);
  });

  it("says why in plain words when the database refuses", async () => {
    mount(createElement(VouchReplySheet, { vouch, voucherUsername: "kev", onClose: () => {}, writes: fakeWrites({ ok: false, error: "raw", hint: "vouch_blocked" }) }));
    type("That's not what happened.");
    click(button("Post reply"));
    await settle();
    assert.equal($("[role='alert']")?.textContent, "You can't vouch for this account.");
  });

  it("only your own vouches page offers Reply, and Edit reply once there is one", () => {
    const row = {
      id: "v1",
      rating: "positive" as const,
      note: "Shipped fast.",
      createdAt: "2026-11-25T12:00:00Z",
      editedAt: null,
      reply: null as string | null,
      replyAt: null,
      replyEditedAt: null,
      voucher: { id: "kev", username: "kev", displayName: "Kev", avatarUrl: null, accent: null, createdAt: null, vouchTotal: 0 },
      hasLoggedDeal: false,
    };
    const subject = { id: "me", username: "donnie" };
    const draw = (props: object) => renderToStaticMarkup(createElement(VouchRowItem, { row, subject, showMenus: false, ...props }));
    assert.doesNotMatch(draw({}), />Reply</);
    assert.match(draw({ onReply: () => {} }), /min-h-11[^>]*>Reply</);
    assert.match(draw({ onReply: () => {}, row: { ...row, reply: "Thanks." } }), />Edit reply</);
    const page = readFileSync(join(process.cwd(), "components/vouches/vouches-page.tsx"), "utf8");
    assert.match(page, /onReply=\{own \? \(\) => setReplyTo\(row\.id\) : undefined\}/);
  });
});

describe("the vouch bar in a chat", () => {
  const status = (extra: Partial<VouchStatus>): VouchStatus => ({ canVouch: false, reason: null, mine: null, ...extra });

  it("offers Vouch only once the database says the reader can, and Edit vouch after", () => {
    assert.deepEqual(vouchBarAction(status({ canVouch: true }), "kev"), { kind: "button", label: "Vouch" });
    assert.deepEqual(vouchBarAction(status({ canVouch: true, mine: { id: "v1", rating: "positive", note: "" } }), "kev"), { kind: "button", label: "Edit vouch" });
    assert.deepEqual(vouchBarAction(null, "kev"), { kind: "none" }, "nothing while the answer loads");
  });

  it("gives each not-yet reason as a short, quiet line", () => {
    const reason = (hint: VouchStatus["reason"]) => vouchBarAction(status({ reason: hint }), "kev");
    // No reply yet, or a reply under a day old: the same line, the real rule.
    assert.deepEqual(reason("vouch_no_conversation"), { kind: "reason", text: "You can vouch 24 hours after you've both messaged." });
    assert.deepEqual(reason("vouch_conversation_too_new"), { kind: "reason", text: "You can vouch 24 hours after you've both messaged." });
    assert.deepEqual(reason("vouch_too_new_voucher"), { kind: "reason", text: "Your account needs to be 7 days old to vouch." });
    assert.deepEqual(reason("vouch_too_new_subject"), { kind: "reason", text: "@kev's account needs to be 7 days old to get vouches." });
    assert.deepEqual(reason("vouch_rate_limited"), { kind: "reason", text: "You've left a lot of vouches today. Try again tomorrow." });
    assert.deepEqual(reason("vouch_suspended"), { kind: "reason", text: "Your account can't vouch right now." });
  });

  it("hides the whole bar across a block, and says nothing where there is nothing useful to say", () => {
    assert.deepEqual(vouchBarAction(status({ reason: "vouch_blocked" }), "kev"), { kind: "hidden" });
    assert.deepEqual(vouchBarAction(status({ reason: "vouch_test_mismatch" }), "kev"), { kind: "none" });
    assert.deepEqual(vouchBarAction(status({ reason: "vouch_self" }), "kev"), { kind: "none" });
    assert.deepEqual(vouchBarAction(status({}), "kev"), { kind: "none" });
    mount(createElement(VouchThreadBarRow, { partner: KEV, status: status({ reason: "vouch_blocked" }), onVouch: () => {} }));
    assert.equal(host.innerHTML, "");
  });

  it("is one 44px row: their vouches on the left, the button or the reason on the right", () => {
    let opened = 0;
    mount(createElement(VouchThreadBarRow, { partner: KEV, status: status({ canVouch: true }), onVouch: () => (opened += 1) }));
    const bar = $("[data-vouch-bar]")!;
    assert.match(bar.firstElementChild!.className, /min-h-11/);
    assert.equal(bar.getAttribute("role"), "group");
    assert.match(button("Vouch")!.className, /min-h-11/);
    assert.match(button("Vouch")!.className, /text-violet-700/);
    click(button("Vouch"));
    assert.equal(opened, 1);
    act(() => root!.render(createElement(SocialContext.Provider, { value: social() }, createElement(VouchThreadBarRow, { partner: KEV, status: status({ reason: "vouch_conversation_too_new" }), onVouch: () => {} }))));
    assert.equal(button("Vouch"), undefined);
    assert.ok(bar.isConnected || $("[data-vouch-bar]"));
    assert.ok($("[data-vouch-bar]")?.textContent?.includes("You can vouch 24 hours after you've both messaged."));
    assert.equal($("[data-vouch-bar] [role='alert']"), null, "a helper, never an error");
  });

  it("sits under the chat header, above the deal panel, with no new button in the header", () => {
    const thread = readFileSync(join(process.cwd(), "components/message-thread.tsx"), "utf8");
    assert.match(thread, /<VouchThreadBar partner=\{partner\} \/>\s*<DealThreadPanel partnerId=\{partner\.id\} \/>/);
    const shell = readFileSync(join(process.cwd(), "components/vouches/vouch-thread-bar.tsx"), "utf8");
    assert.match(shell, /blockedIds\.includes\(partner\.id\)\) return null;/);
    assert.match(shell, /lazyPart<BarProps>/);
    // The chat itself carries only the shell: the gate, the store and the copy are in the row's chunk.
    assert.doesNotMatch(shell, /use-vouch-(store|summary)|lib\/vouches/);
    const view = readFileSync(join(process.cwd(), "components/vouches/vouch-thread-bar-view.tsx"), "utf8");
    assert.match(view, /if \(!supported\) return pending \?/);
  });
});

describe("local mode follows the same chat rules", () => {
  const NOW = Date.parse("2026-11-28T12:00:00Z");
  const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
  const msg = (senderId: string, receiverId: string, hours: number) => ({ senderId, receiverId, createdAt: hoursAgo(hours) });

  it("needs a message each way, and 24 hours since the later of the two first messages", () => {
    assert.equal(chatRefusal([], "me", "kev", NOW), "vouch_no_conversation");
    assert.equal(chatRefusal([msg("me", "kev", 72)], "me", "kev", NOW), "vouch_no_conversation");
    assert.equal(chatRefusal([msg("me", "kev", 72), msg("kev", "me", 2)], "me", "kev", NOW), "vouch_conversation_too_new");
    assert.equal(chatRefusal([msg("me", "kev", 2), msg("kev", "me", 72)], "me", "kev", NOW), "vouch_conversation_too_new");
    assert.equal(chatRefusal([msg("me", "kev", 72), msg("kev", "me", 30), msg("kev", "me", 1)], "me", "kev", NOW), null);
    assert.equal(chatRefusal([msg("me", "sam", 72), msg("sam", "me", 72)], "me", "kev", NOW), "vouch_no_conversation");
  });

  it("the status and the save both hold to it, and an existing vouch can always be edited", async () => {
    const viewer = { id: "me", username: "donnie", displayName: "Donnie" };
    const people = [{ id: "kev", username: "kev", displayName: "Kev" }];
    const fresh = localVouchBackend({ storage: null, viewer, people, chat: [msg("me", "kev", 72), msg("kev", "me", 2)], now: () => NOW });
    assert.deepEqual(await fresh.status("kev"), { canVouch: false, reason: "vouch_conversation_too_new", mine: null });
    assert.deepEqual(await fresh.upsert("kev", "positive", ""), { ok: false, error: "You can vouch 24 hours after you've both messaged.", hint: "vouch_conversation_too_new" });
    const ready = localVouchBackend({ storage: null, viewer, people, chat: [msg("me", "kev", 72), msg("kev", "me", 48)], now: () => NOW });
    assert.deepEqual(await ready.status("kev"), { canVouch: true, reason: null, mine: null });
    assert.equal((await ready.upsert("kev", "positive", "Shipped fast.")).ok, true);
    assert.equal((await ready.status("kev")).mine?.note, "Shipped fast.");
    // No messages passed (older callers): nothing extra is asked.
    const open = localVouchBackend({ storage: null, viewer, people, now: () => NOW });
    assert.equal((await open.status("kev")).canVouch, true);
  });
});

describe("vouch notification rows", () => {
  it("the icon follows the rating: thumbs up, a dash, thumbs down, and a plain check for a mixed row", () => {
    const note = (rating: unknown) => ({ metadata: { vouch_id: "v1", rating } });
    assert.equal(vouchNoticeIcon([note("positive")]), "positive");
    assert.equal(vouchNoticeIcon([note("neutral")]), "neutral");
    assert.equal(vouchNoticeIcon([note("negative")]), "negative");
    assert.equal(vouchNoticeIcon([note("positive"), note("positive")]), "positive");
    assert.equal(vouchNoticeIcon([note("positive"), note("negative")]), "mixed");
    assert.equal(vouchNoticeIcon([note("great")]), "mixed");
    assert.equal(vouchNoticeIcon([{ metadata: null }]), "mixed");
    assert.equal(vouchNoticeIcon([]), "mixed");
    const view = readFileSync(join(process.cwd(), "components/notifications-view.tsx"), "utf8");
    assert.match(view, /const VOUCH_ICONS = \{ positive: ThumbsUp, neutral: Minus, negative: ThumbsDown, mixed: BadgeCheck \};/);
    assert.match(view, /if \(kind === "vouch"\) return VOUCH_ICONS\[vouchNoticeIcon\(notes\)\];/);
    assert.match(view, /if \(kind === "vouch_reply"\) return Reply;/);
    assert.match(view, /const Icon = groupIcon\(group\.kind, group\.notes\);/);
  });

  it("every new string keeps to the wording rules", () => {
    const lines = [VOUCH_COPY.cancel, VOUCH_COPY.ratingLabel, VOUCH_COPY.noteLabel, VOUCH_COPY.counter(5, 280), VOUCH_COPY.loggedDealNote("kev"), VOUCH_COPY.postReply, VOUCH_COPY.replyLabel, VOUCH_COPY.replyFootnote, VOUCH_COPY.removeReplyConfirmTitle, VOUCH_COPY.removeReplyConfirmBody, VOUCH_COPY.barLabel("kev")];
    for (const line of lines) {
      assert.doesNotMatch(line, /\bbest\b|\bfree\b|number one|\bflip|\bmail|quick comp|verif|!/i, line);
      assert.doesNotMatch(line, /\bAI\b/, line);
    }
  });
});
