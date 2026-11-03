import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import { ReportActions, SUSPEND_BODY, suspendTitle } from "@/components/report-actions";

installDom();

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };

async function mount(props: { canModeratePost: boolean; canDelete: boolean; reported?: string }) {
  const { createRoot } = await import("react-dom/client");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(ReportActions, { reportId: "report-1", reported: props.reported ?? "@demo_flipper", ...props }),
      ),
    );
  });
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function button(host: HTMLElement, name: string) {
  return [...host.querySelectorAll("button")].find((node) => node.textContent?.trim() === name);
}

describe("Suspend account on /admin/reports", () => {
  it("shows on post, reply and user reports", async () => {
    for (const props of [
      { canModeratePost: true, canDelete: true },
      { canModeratePost: false, canDelete: true },
      { canModeratePost: false, canDelete: false },
    ]) {
      const view = await mount(props);
      assert.ok(button(view.host, "Suspend account"), JSON.stringify(props));
      view.unmount();
    }
  });

  it("asks first, with Suspend and Cancel", async () => {
    const view = await mount({ canModeratePost: false, canDelete: false });
    assert.equal(view.host.querySelector('[role="dialog"]'), null);
    await act(async () => {
      button(view.host, "Suspend account")?.click();
    });
    const dialog = view.host.querySelector('[role="dialog"]');
    assert.ok(dialog, "confirm dialog");
    assert.match(dialog.textContent ?? "", /Suspend @demo_flipper\?/);
    assert.match(dialog.textContent ?? "", /They can't log in and their posts are hidden/);
    assert.ok(button(dialog as HTMLElement, "Suspend"));
    const cancel = button(dialog as HTMLElement, "Cancel");
    assert.ok(cancel);
    await act(async () => {
      cancel.click();
    });
    assert.equal(view.host.querySelector('[role="dialog"]'), null);
    view.unmount();
  });

  it("words the dialog", () => {
    assert.equal(suspendTitle("@demo_flipper"), "Suspend @demo_flipper?");
    assert.equal(suspendTitle("Unknown"), "Suspend this account?");
    assert.equal(SUSPEND_BODY, "They can't log in and their posts are hidden");
  });

  it("reuses the SafetyMenu confirm dialog and says where to lift a suspension", () => {
    const actions = readFileSync(join(process.cwd(), "components/report-actions.tsx"), "utf8");
    assert.match(actions, /import \{ ConfirmDialog \} from "@\/components\/safety-menu"/);
    const page = readFileSync(join(process.cwd(), "app/(app)/admin/reports/page.tsx"), "utf8");
    assert.match(page, /reported=\{report\.reported\}/);
    assert.match(page, />Lift a suspension in Supabase Auth</);
  });
});
