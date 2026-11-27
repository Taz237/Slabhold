import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const { PathnameContext, SearchParamsContext } = require(
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
) as {
  PathnameContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000/compose",
  pretendToBeVisual: true,
});
const win = dom.window;
Object.defineProperty(win, "innerHeight", { configurable: true, value: 844 });
Object.defineProperty(win, "innerWidth", { configurable: true, value: 390 });
Object.defineProperty(win, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }),
});

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("HTMLInputElement", win.HTMLInputElement);
expose("HTMLTextAreaElement", win.HTMLTextAreaElement);
expose("HTMLFormElement", win.HTMLFormElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("localStorage", win.localStorage);
expose("sessionStorage", win.sessionStorage);
expose("requestAnimationFrame", win.requestAnimationFrame.bind(win));
expose("cancelAnimationFrame", win.cancelAnimationFrame.bind(win));
expose("fetch", async () => new win.Response(null, { status: 404 }));
expose("IS_REACT_ACT_ENVIRONMENT", true);

const fixtureUser = {
  id: "user-1",
  username: "fixturecollector",
  displayName: "Fixture Collector",
  accent: "#7C3AED",
  avatarDataUrl: null,
};

/** The search string the composer opens with, e.g. "poll=1". */
let search = "";
/** Every single post the composer sent. */
const postCalls: { body: string; poll?: unknown }[] = [];
const threadCalls: string[][] = [];

let ComposeView: ComponentType;

before(async () => {
  ({ ComposeView } = await import("@/components/compose-view"));
});

after(() => {
  win.close();
});

function Harness({ children }: { children?: ReactNode }) {
  const social = {
    ready: true,
    mode: "local" as const,
    user: fixtureUser,
    posts: [],
    profiles: [],
    blockedIds: [],
    followingOf: () => [],
    createPost: async (input: { body: string; poll?: unknown }) => {
      postCalls.push(input);
      return { error: null, postId: "post-1" };
    },
    createThread: async (inputs: { body: string }[]) => {
      threadCalls.push(inputs.map((input) => input.body));
      return { error: null, postId: "post-1" };
    },
    updatePost: async () => ({ error: null }),
  };
  const collection = { ready: true, loaded: true, cards: [], syncError: null };
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      PathnameContext.Provider,
      { value: "/compose" },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams(search) },
        createElement(
          SocialContext.Provider,
          { value: social as never },
          createElement(CollectionContext.Provider, { value: collection as never }, children),
        ),
      ),
    ),
  );
}

async function frames(count = 3) {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await new Promise((resolve) => win.requestAnimationFrame(() => resolve(null)));
    });
  }
}

async function waitFor(check: () => boolean, label: string) {
  for (let i = 0; i < 60; i += 1) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  assert.fail(`timed out: ${label}`);
}

async function mount(query: string, body: string | null) {
  search = query;
  win.localStorage.clear();
  const { clearComposeDraft } = await import("@/lib/social/compose-draft");
  clearComposeDraft();
  if (body !== null) {
    // What the home feed's poll button does before it opens /compose.
    const { startPollInComposer } = await import("@/lib/social/inline-poll");
    const pushed: string[] = [];
    startPollInComposer(body, (href) => pushed.push(href));
    assert.deepEqual(pushed, ["/compose?poll=1"]);
  }
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness, null, createElement(ComposeView)));
  });
  await frames();
  return {
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const editorOpen = () => Boolean(win.document.querySelector("[data-compose-poll]"));
const field = () => win.document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!;

describe("the home feed's poll button opens /compose with a poll", () => {
  it("opens the poll editor with the typed text carried over", async () => {
    const view = await mount("poll=1", "Best rookie of 2024?");
    try {
      await waitFor(editorOpen, "the poll editor");
      assert.equal(field().value, "Best rookie of 2024?");
      assert.equal(field().placeholder, "Ask a question");
      const pollButton = win.document.querySelector<HTMLButtonElement>('[aria-label="Poll added"]');
      assert.ok(pollButton?.disabled, "the toolbar shows the poll as added");
    } finally {
      view.unmount();
    }
  });

  it("posts the question and the poll together", async () => {
    postCalls.length = 0;
    const view = await mount("poll=1", "Raw or graded?");
    try {
      await waitFor(editorOpen, "the poll editor");
      const inputs = [...win.document.querySelectorAll<HTMLInputElement>("[data-compose-poll] input")];
      const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!;
      for (const [index, value] of ["Raw", "Graded"].entries()) {
        await act(async () => {
          setter.call(inputs[index]!, value);
          inputs[index]!.dispatchEvent(new win.Event("input", { bubbles: true }));
        });
      }
      const post = win.document.querySelector<HTMLButtonElement>('[role="dialog"] button[type="submit"]')!;
      assert.equal(post.disabled, false);
      await act(async () => {
        post.click();
      });
      await waitFor(() => postCalls.length === 1, "the post was sent");
      assert.equal(postCalls[0]!.body, "Raw or graded?");
      assert.deepEqual((postCalls[0]!.poll as { options: string[] }).options, ["Raw", "Graded"]);
    } finally {
      view.unmount();
    }
  });

  it("opens a normal post without the flag, and never a poll while quoting or editing", async () => {
    for (const query of ["", "poll=1&quote=post-9", "poll=1&edit=post-9"]) {
      const view = await mount(query, null);
      try {
        await frames();
        assert.equal(editorOpen(), false, query || "no flag");
      } finally {
        view.unmount();
      }
    }
  });
});
