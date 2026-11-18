import { createRequire } from "node:module";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LeaderboardView } from "@/components/leaderboard-view";
import { presentLeaderboard, type LeaderboardSnapshot } from "@/lib/leaderboard/present";
import type { LeaderboardBoardId } from "@/lib/leaderboard/rules";
import type { CandidateRow } from "@/lib/leaderboard/score";
import { emptySnapshot } from "@/lib/leaderboard/snapshot";
import { userHref } from "@/lib/social/user-href";

/** Test fixtures for the leaderboard view. Fake ids and handles only. */
export const VIEW_NOW = new Date("2026-10-23T18:00:00.000Z");

export function row(userId: string, points: number, extra: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id: userId,
    userId,
    title: `Name ${userId}`,
    subtitle: `@${userId}`,
    href: userHref(userId),
    avatarUrl: null,
    accent: "#7c5cff",
    contributions: [{ actorId: "fan", points }],
    ...extra,
  };
}

export function rows(count: number): CandidateRow[] {
  return Array.from({ length: count }, (_, index) => row(`u${index}`, 30 - index));
}

export type Rows = Partial<Record<LeaderboardBoardId, CandidateRow[]>>;

export function snap(current: Rows, previous: Rows = {}): LeaderboardSnapshot {
  const empty = emptySnapshot(VIEW_NOW);
  for (const [id, list] of Object.entries(current)) empty.current.boards[id as LeaderboardBoardId] = { rows: list };
  for (const [id, list] of Object.entries(previous)) empty.previous.boards[id as LeaderboardBoardId] = { rows: list };
  return empty;
}

export function pageModel(snapshot: LeaderboardSnapshot, viewer: string | null = null, week: "current" | "previous" = "current") {
  return presentLeaderboard({ snapshot, viewer: { userId: viewer, hiddenIds: [] }, week, focusBoardId: null, now: VIEW_NOW });
}

// Pull to refresh and Try again use the app router, as they do in the app.
const testRouter = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
const { AppRouterContext } = createRequire(process.cwd() + "/package.json")(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as { AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode } };

/** The node inside the app router, for a static render. */
export function withRouter(node: ReactNode): ReactNode {
  return createElement(AppRouterContext.Provider, { value: testRouter }, node);
}

export function render(model: ReturnType<typeof pageModel>): string {
  return renderToStaticMarkup(withRouter(createElement(LeaderboardView, { model })));
}

/** One board's section markup. */
export function boardHtml(markup: string, boardId: string): string {
  const start = markup.indexOf(`data-board="${boardId}"`);
  if (start < 0) throw new Error(`board ${boardId} is missing`);
  return markup.slice(start, markup.indexOf("</section>", start));
}

/** The markup between `<ol ... marker ...>` and its `</ol>`. Lists here never nest. */
export function listHtml(markup: string, marker: string): string | null {
  const at = markup.indexOf(marker);
  if (at < 0) return null;
  const open = markup.lastIndexOf("<ol", at);
  return markup.slice(open, markup.indexOf("</ol>", at));
}

/** Each top-level `<li>` in a list, opening tag and body. */
export function items(list: string): { tag: string; body: string }[] {
  const out: { tag: string; body: string }[] = [];
  let from = 0;
  for (;;) {
    const start = list.indexOf("<li", from);
    if (start < 0) break;
    const tagEnd = list.indexOf(">", start);
    const end = list.indexOf("</li>", tagEnd);
    out.push({ tag: list.slice(start, tagEnd + 1), body: list.slice(tagEnd + 1, end) });
    from = end + 5;
  }
  return out;
}

/** The pinned bar's markup in one board, or null. */
export function barHtml(section: string): string | null {
  const at = section.indexOf("data-your-spot");
  if (at < 0) return null;
  const open = section.lastIndexOf("<div", at);
  return section.slice(open);
}
