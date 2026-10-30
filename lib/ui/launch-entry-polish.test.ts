import assert from "node:assert/strict";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { join } from "node:path";
import { AttachCardField } from "@/components/attach-card-field";
import { FirstCardPrivacyPrompt } from "@/components/first-card-privacy-prompt";
import { HomeFirstCardPrompt } from "@/components/home-first-card-prompt";
import { MentionText } from "@/components/mention-text";
import {
  dismissFirstCardPrivacy,
  readFirstCardPrivacyPrompt,
  shouldMarkFirstCardPrivacy,
  writeFirstCardPrivacyPending,
  type KeyValueStore,
} from "@/lib/collection/first-card-privacy";
import { GET_STARTED_CHECKLIST_HREF, splitPostText } from "@/lib/social/post-text";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe("launch entry points", () => {
  it("labels the camera tab and the purple Post button", () => {
    const shell = read("components/app-shell.tsx");
    assert.match(shell, /aria-label="Add card"/);
    assert.match(shell, />\s*Add card\s*</);
    assert.match(shell, /bg-violet-600/);
    const menu = read("components/create-menu.tsx");
    assert.match(menu, /aria-label="Post"/);
    assert.match(menu, />\s*Post\s*</);
    assert.equal((menu.match(/aria-label="Post"/g) ?? []).length, 2);
  });

  it("keeps the scan route and stops the side menu from offering a scan", () => {
    assert.match(read("app/(app)/scan/page.tsx"), /ScanView/);
    assert.match(read("components/scan-view.tsx"), /export function ScanView/);
    const more = read("lib/ui/side-menu.ts");
    assert.doesNotMatch(more, /\/scan/);
    assert.doesNotMatch(read("components/side-menu.tsx"), /\/scan/);
    assert.match(more, /href: "\/cards\/new"/);
  });
});

describe("empty card prompts", () => {
  it("links an empty attach list to add a card", () => {
    const html = renderToStaticMarkup(
      createElement(AttachCardField, {
        cards: [],
        value: "",
        onChange: () => undefined,
        selectClassName: "select",
      }),
    );
    assert.match(html, /Attach a card/);
    assert.match(html, /href="\/cards\/new"/);
    assert.match(html, />Add a card</);
    assert.match(html, /min-h-11/);
    assert.doesNotMatch(html, /<select/);

    const filled = renderToStaticMarkup(
      createElement(AttachCardField, {
        cards: [{ id: "card-1", year: 2024, playerName: "Ada" }],
        value: "",
        onChange: () => undefined,
        selectClassName: "select",
      }),
    );
    assert.match(filled, /<select/);
    assert.match(filled, /aria-label="Attach a card"/);
    assert.match(filled, /2024 Ada/);
    const compose = read("components/compose-view.tsx");
    const feed = read("components/feed-view.tsx");
    assert.match(compose, /cardsReady && !syncError \? \([\s\S]*<AttachCardField/);
    assert.match(compose, /aria-label="Attach a card"[\s\S]*disabled=\{!cardsUsable\}/);
    assert.match(compose, /const cardsUsable = cardsReady && !syncError;/);
    assert.match(feed, /cardsReady && !syncError \? \([\s\S]*<AttachCardField/);
    assert.match(feed, /<select[\s\S]*disabled[\s\S]*Attach a card/);
  });

  it("shows a small add-your-first-card prompt on an empty home", () => {
    const html = renderToStaticMarkup(createElement(HomeFirstCardPrompt));
    assert.match(html, /href="\/cards\/new"/);
    assert.match(html, />Add your first card</);
    assert.match(html, /min-h-11/);
    assert.match(html, /recent sold prices/, "a full row with a reason, not a bare link");
    assert.match(html, /rounded-2xl/);
    assert.doesNotMatch(html, /underline/);
    const feed = read("components/feed-view.tsx");
    assert.match(feed, /showWelcome \? <HomeFirstCardPrompt afterGetStarted=\{welcomeAfterGetStarted\} \/>/);
    assert.doesNotMatch(feed, /<FirstCardWelcome/);
    const dash = read("components/dashboard.tsx");
    assert.match(dash, /<FirstCardWelcome \/>/);
  });
});

describe("Get started checklist link", () => {
  it("turns the welcome phrase into a link to the home checklist", () => {
    const text =
      "Joining Slabhold is easier, with a Get started checklist for new collectors. Ask @slabhold.";
    const parts = splitPostText(text);
    const linked = parts.filter((part) => part.type !== "text");
    assert.deepEqual(
      linked.map((part) => part.text),
      ["Get started checklist", "@slabhold"],
    );
    const checklist = parts.find((part) => part.type === "checklist");
    assert.equal(checklist && checklist.type === "checklist" ? checklist.href : "", GET_STARTED_CHECKLIST_HREF);

    const html = renderToStaticMarkup(createElement(MentionText, { text }));
    assert.match(html, /href="\/#get-started"/);
    assert.match(html, />Get started checklist</);
    assert.match(html, /href="\/u\/slabhold"/);
    assert.match(read("components/get-started.tsx"), /id="get-started"/);
  });
});

describe("first card privacy nudge", () => {
  it("offers the prompt once, only after the first private save", () => {
    assert.equal(
      shouldMarkFirstCardPrivacy({
        isNew: true,
        isPublic: false,
        cardCountBeforeSave: 0,
        cardsReady: true,
        syncError: null,
      }),
      true,
    );
    assert.equal(
      shouldMarkFirstCardPrivacy({
        isNew: true,
        isPublic: true,
        cardCountBeforeSave: 0,
        cardsReady: true,
        syncError: null,
      }),
      false,
    );
    assert.equal(
      shouldMarkFirstCardPrivacy({
        isNew: false,
        isPublic: false,
        cardCountBeforeSave: 0,
        cardsReady: true,
        syncError: null,
      }),
      false,
    );
    assert.equal(
      shouldMarkFirstCardPrivacy({
        isNew: true,
        isPublic: false,
        cardCountBeforeSave: 2,
        cardsReady: true,
        syncError: null,
      }),
      false,
    );
    assert.equal(
      shouldMarkFirstCardPrivacy({
        isNew: true,
        isPublic: false,
        cardCountBeforeSave: 0,
        cardsReady: false,
        syncError: null,
      }),
      false,
    );

    const store = memoryStore();
    assert.equal(readFirstCardPrivacyPrompt(store, "ada", "card-1", false), false);
    writeFirstCardPrivacyPending(store, "ada", "card-1");
    assert.equal(readFirstCardPrivacyPrompt(store, "ada", "card-1", false), true);
    assert.equal(readFirstCardPrivacyPrompt(store, "ada", "card-2", false), false);
    assert.equal(readFirstCardPrivacyPrompt(store, "ada", "card-1", true), false);
    dismissFirstCardPrivacy(store, "ada");
    writeFirstCardPrivacyPending(store, "ada", "card-1");
    assert.equal(readFirstCardPrivacyPrompt(store, "ada", "card-1", false), false);
  });

  it("uses the existing privacy toggle and a Not now action", () => {
    let toggled = 0;
    let dismissed = 0;
    const html = renderToStaticMarkup(
      createElement(FirstCardPrivacyPrompt, {
        onToggle: () => {
          toggled += 1;
        },
        onDismiss: () => {
          dismissed += 1;
        },
      }),
    );
    assert.match(html, /Only you can see this card\. Show it on your profile\?/);
    assert.match(html, /role="switch"/);
    assert.match(html, /aria-label="Show it on your profile"/);
    assert.match(html, />Not now</);
    assert.match(html, /min-h-11/);
    const detail = read("components/card-detail.tsx");
    assert.match(detail, /<FirstCardPrivacyPrompt/);
    assert.match(detail, /updateCard\(card\.id, \{ isPublic: !card\.isPublic \}\)/);
    assert.match(detail, /onToggle=\{\(\) => \{/);
    const form = read("components/card-form.tsx");
    assert.match(form, /shouldMarkFirstCardPrivacy\(/);
    assert.match(form, /rememberFirstCardPrivacy\(/);
    assert.match(form, /grid size-11 shrink-0 place-items-center/);
    assert.equal(toggled, 0);
    assert.equal(dismissed, 0);
  });
});
