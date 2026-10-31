"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ComponentProps } from "react";
import type { MentionTextarea as MentionTextareaType } from "@/components/mention-textarea";
import { afterFirstIdle } from "@/lib/ui/idle";

type Props = ComponentProps<typeof MentionTextareaType>;

let full: typeof MentionTextareaType | null = null;
let pending: Promise<typeof MentionTextareaType> | null = null;
const listeners = new Set<() => void>();

/** Fetches the full box's chunk once. A failed fetch can be tried again. */
export function preloadMentionTextarea(): Promise<typeof MentionTextareaType> {
  pending ??= import("@/components/mention-textarea").then(
    (mod) => {
      full = mod.MentionTextarea;
      for (const listener of listeners) listener();
      return mod.MentionTextarea;
    },
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Caret of the plain box, when it had focus as the full one replaced it. */
let handoff: { start: number; end: number } | null = null;

/**
 * The same box and wrapper as MentionTextarea, without the @-mention list.
 * Typing works from the first key: the value lives in the parent either way.
 */
function PlainTextarea({ value, onChange, maxLength, rows = 3, autoFocus = false, placeholder, className, id }: Props) {
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(
    () =>
      afterFirstIdle(() => {
        // The Home composer is hidden on a phone: don't fetch for a box nobody can see.
        if (field.current && field.current.getClientRects().length > 0) void preloadMentionTextarea().catch(() => {});
      }),
    [],
  );
  useLayoutEffect(() => {
    const node = field.current;
    return () => {
      if (node && document.activeElement === node) {
        handoff = { start: node.selectionStart ?? node.value.length, end: node.selectionEnd ?? node.value.length };
      }
    };
  }, []);
  const want = () => void preloadMentionTextarea().catch(() => {});
  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        ref={field}
        id={id}
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
        onFocus={want}
        onPointerDown={want}
        className={className}
      />
    </div>
  );
}

/** The full box, taking focus and the caret from the plain one it replaced. */
function FullTextarea({ Full, ...props }: Props & { Full: typeof MentionTextareaType }) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const caret = handoff;
    handoff = null;
    if (!caret || !field.current) return;
    field.current.focus();
    field.current.setSelectionRange(caret.start, caret.end);
  }, []);
  return <Full {...props} ref={field} />;
}

/**
 * MentionTextarea from its own chunk, for the Home composer. A plain box
 * that looks the same is drawn first; the full one (with @-mention
 * suggestions) is fetched at the first idle moment while the box is on
 * screen, or on the first tap or focus, and takes over in place, keeping
 * the text, focus and caret.
 */
export function LazyMentionTextarea(props: Props) {
  const Full = useSyncExternalStore(
    subscribe,
    () => full,
    () => null,
  );
  return Full ? <FullTextarea {...props} Full={Full} /> : <PlainTextarea {...props} />;
}
