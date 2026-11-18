"use client";

import { useEffect } from "react";

/** Brings the board a `?board=` link names into view. Its tab is picked on the server (components/leaderboard-stage.tsx). */
export function LeaderboardFocus({ boardId }: { boardId: string }) {
  useEffect(() => {
    const board = document.getElementById(`board-${boardId}`);
    if (!board) return;
    // The linked board's tab is already the one showing. Scroll only when the board starts below the fold.
    if (board.getBoundingClientRect().top < window.innerHeight * 0.6) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    board.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [boardId]);
  return null;
}
