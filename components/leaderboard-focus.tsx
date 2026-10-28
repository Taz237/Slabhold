"use client";

import { useEffect } from "react";

/** Scrolls the board a `?board=` link names into view. The highlight is CSS on `data-board-focus`. */
export function LeaderboardFocus({ boardId }: { boardId: string }) {
  useEffect(() => {
    const board = document.getElementById(`board-${boardId}`);
    if (!board) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    board.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [boardId]);
  return null;
}
