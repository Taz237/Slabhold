"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Copy } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { haptic } from "@/lib/ios/haptics";
import { MenuSheet, menuSheetItem } from "@/components/menu-sheet";
import {
  LONG_PRESS_MS,
  PRESS_SLOP_PX,
  REACTION_EMOJIS,
  REACTION_NAMES,
  tapGesture,
  type ReactionEmoji,
  type ReactionPill,
} from "@/lib/social/message-reactions";

/** A light tap when a reaction lands: the like tap for a double-tap heart. */
export function reactionHaptic(via: "double" | "bar"): void {
  haptic(via === "double" ? "like" : "tick");
}

/**
 * Tap, double-tap and long-press on a DM bubble. A tap toggles the time at
 * once (as before); a second tap in time toggles it back and double-taps.
 * Holding still for LONG_PRESS_MS (or a right-click) opens the emoji bar
 * with a light haptic, and the click that follows the hold is swallowed.
 */
export function useBubbleGestures(input: {
  enabled: boolean;
  onTap: () => void;
  onDoubleTap: () => void;
  onLongPress: () => void;
}) {
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });
  const timer = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  /** This press already opened the bar, so Android's contextmenu after the hold doesn't open it twice. */
  const held = useRef(false);
  const lastTap = useRef<number | null>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    start.current = null;
  };
  const press = () => {
    cancel();
    held.current = true;
    lastTap.current = null;
    haptic("tick");
    latest.current.onLongPress();
  };

  return {
    onPointerDown(event: PointerEvent) {
      held.current = false;
      if (!latest.current.enabled || (event.pointerType === "mouse" && event.button !== 0)) return;
      start.current = { x: event.clientX, y: event.clientY };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(press, LONG_PRESS_MS);
    },
    onPointerMove(event: PointerEvent) {
      const from = start.current;
      if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > PRESS_SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu(event: MouseEvent) {
      if (!latest.current.enabled) return;
      event.preventDefault();
      if (!held.current) press();
    },
    onClick() {
      if (held.current) {
        held.current = false;
        return;
      }
      latest.current.onTap();
      if (!latest.current.enabled) return;
      const gesture = tapGesture(lastTap.current, Date.now());
      if (gesture.kind === "double") {
        lastTap.current = null;
        latest.current.onDoubleTap();
      } else {
        lastTap.current = gesture.at;
      }
    },
  };
}

/**
 * The emoji bar: six reactions and Copy, springing up from the bubble.
 * Escape, a tap outside or scrolling the thread closes it. The tap outside
 * only closes; it doesn't also open whatever was under it.
 */
export function ReactionBar({
  mine,
  current,
  below,
  onPick,
  onCopy,
  onClose,
}: {
  /** The viewer's bubble: the bar lines up with its right edge. */
  mine: boolean;
  /** The viewer's reaction, marked in the bar. */
  current: ReactionEmoji | null;
  /** Too close to the top of the thread: open under the bubble instead. */
  below: boolean;
  onPick: (emoji: ReactionEmoji) => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const bar = ref.current;
    bar?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    const scroller = bar?.closest("[data-thread-scroller]");
    // The tap that closes the bar only closes it: its click is eaten once.
    // This outlives the bar on purpose, and lets go after half a second.
    const eatClick = (event: Event) => {
      event.stopPropagation();
      event.preventDefault();
      document.removeEventListener("click", eatClick, true);
    };
    const onDown = (event: Event) => {
      if (bar && event.target instanceof Node && bar.contains(event.target)) return;
      document.addEventListener("click", eatClick, true);
      window.setTimeout(() => document.removeEventListener("click", eatClick, true), 500);
      closeRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeRef.current();
    };
    const onScroll = () => closeRef.current();
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      scroller?.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="React to message"
      data-reaction-bar=""
      className={`absolute z-30 flex items-center gap-0.5 rounded-full border border-zinc-200 bg-white p-1 shadow-lg shadow-black/10 dark:border-white/10 dark:bg-zinc-900 motion-safe:animate-[reaction-bar-in_340ms_cubic-bezier(0.2,0.7,0.2,1)_both] ${
        below ? "top-full mt-2" : "bottom-full mb-2"
      } ${mine ? "right-0" : "left-0"}`}
      style={{ transformOrigin: `${below ? "top" : "bottom"} ${mine ? "right" : "left"}` }}
    >
      {REACTION_EMOJIS.map((emoji, index) => (
        <button
          key={emoji}
          type="button"
          role="menuitemradio"
          aria-checked={current === emoji}
          aria-label={`React with ${REACTION_NAMES[emoji]}`}
          onClick={() => onPick(emoji)}
          className={`grid h-11 w-11 place-items-center rounded-full text-[26px] leading-none transition-[transform,background-color] duration-150 hover:bg-zinc-100 active:scale-90 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 motion-reduce:transition-none motion-safe:animate-[reaction-emoji-in_300ms_cubic-bezier(0.2,0.7,0.2,1)_both] ${
            current === emoji ? "bg-zinc-200 dark:bg-white/15" : ""
          }`}
          style={{ animationDelay: `${40 + index * 22}ms` }}
        >
          <span aria-hidden="true">{emoji}</span>
        </button>
      ))}
      <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-zinc-200 dark:bg-white/10" />
      <button
        type="button"
        role="menuitem"
        aria-label="Copy message"
        onClick={onCopy}
        className="grid h-11 w-11 place-items-center rounded-full text-zinc-600 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-zinc-300 dark:hover:bg-white/10"
      >
        <Copy aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
    </div>
  );
}

/**
 * The small pill under a bubble: each emoji once, plus a 2 when both people
 * reacted. It tucks under the bubble's edge; the button around it is 44px
 * tall without pushing the next message down. A change pops it.
 */
export function ReactionPillButton({
  pill,
  mine,
  label,
  onOpen,
}: {
  pill: ReactionPill;
  mine: boolean;
  /** "Ada Park reacted heart, you reacted fire". */
  label: string;
  onOpen: () => void;
}) {
  const signature = `${pill.emojis.join("")}${pill.count ?? ""}`;
  const [first] = useState(signature);
  return (
    <button
      type="button"
      data-reaction-pill=""
      onClick={onOpen}
      aria-label={`${label}. Show who reacted`}
      className={`relative z-10 -mt-4 -mb-2.5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
        mine ? "mr-1.5" : "ml-1.5"
      }`}
    >
      <span
        key={signature}
        className={`inline-flex h-6 items-center gap-px rounded-full border-2 border-[var(--background)] bg-zinc-100 px-1.5 text-13 leading-none shadow-sm dark:bg-zinc-800 ${
          signature !== first ? "motion-safe:animate-[like-pop_320ms_ease-out]" : ""
        }`}
      >
        {pill.emojis.map((emoji) => (
          <span key={emoji} aria-hidden="true">
            {emoji}
          </span>
        ))}
        {pill.count ? (
          <span aria-hidden="true" className="ml-0.5 font-mono text-11 text-zinc-600 dark:text-zinc-300">
            {pill.count}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export type ReactionPerson = {
  userId: string;
  emoji: ReactionEmoji;
  you: boolean;
  name: string;
  username: string;
  avatar: string | null;
  accent: string;
};

/** Who reacted, from the pill. Your own row removes your reaction. */
export function ReactionsSheet({
  people,
  onRemove,
  onClose,
}: {
  people: ReactionPerson[];
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <MenuSheet label="Reactions" onClose={onClose}>
      <p className="px-5 pt-2 pb-1 text-15 font-semibold">Reactions</p>
      <div data-reactions-sheet="">
        {people.map((person) => {
          const face = (
            <Avatar
              name={person.name}
              image={person.avatar}
              accent={person.accent}
              expandable={false}
              className="h-9 w-9"
            />
          );
          const emoji = (
            <span className="text-2xl leading-none" role="img" aria-label={REACTION_NAMES[person.emoji]}>
              {person.emoji}
            </span>
          );
          if (person.you) {
            return (
              <button
                key={person.userId}
                type="button"
                role="menuitem"
                onClick={onRemove}
                aria-label={`You reacted ${REACTION_NAMES[person.emoji]}. Tap to remove`}
                className={menuSheetItem}
              >
                {face}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-15 font-semibold leading-5">You</span>
                  <span className="block text-13 font-normal text-zinc-500 dark:text-zinc-400">Tap to remove</span>
                </span>
                {emoji}
              </button>
            );
          }
          return (
            <div key={person.userId} className="flex min-h-[3.25rem] items-center gap-3 px-5">
              {face}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-15 font-semibold leading-5">{person.name}</span>
                <span className="block truncate text-13 text-zinc-500 dark:text-zinc-400">@{person.username}</span>
              </span>
              {emoji}
            </div>
          );
        })}
      </div>
    </MenuSheet>
  );
}
