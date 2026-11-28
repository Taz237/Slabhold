"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Handshake, Minus, ThumbsDown, ThumbsUp } from "lucide-react";
import { outlineButton } from "@/components/button-styles";
import { useVouchStore } from "@/components/use-vouch-store";
import { haptic } from "@/lib/ios/haptics";
import { contentProblem } from "@/lib/safety/content-filter";
import { useFocusTrap } from "@/lib/ui/focus-trap";
import { useKeyboardInset } from "@/lib/ui/use-keyboard-inset";
import { useSheetDrag } from "@/lib/ui/use-sheet-drag";
import {
  NOTE_MAX,
  VOUCH_COPY,
  VOUCH_RATINGS,
  vouchErrorCopy,
  vouchHintCopy,
  vouchNoteProblem,
  vouchReplyProblem,
  vouchTextLength,
  type VouchRating,
} from "@/lib/vouches/rules";
import type { VouchStatus, VouchWriteResult } from "@/lib/vouches/types";

/** The vouch sheet and the reply sheet. One chunk, fetched on the tap that opens either. */

const RATING_ICON = { positive: ThumbsUp, neutral: Minus, negative: ThumbsDown } satisfies Record<VouchRating, typeof ThumbsUp>;

const primaryButton =
  "inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-violet-600 px-5 text-sm font-semibold text-white transition-[opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-50 motion-reduce:transition-none";
const quietDanger = "inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-rose-600 dark:text-rose-400";
const field =
  "block w-full resize-none rounded-2xl border border-zinc-300 bg-transparent px-3.5 py-3 text-15 leading-[1.4] outline-none placeholder:text-zinc-500 focus-visible:border-violet-600 focus-visible:ring-2 focus-visible:ring-violet-600/30 dark:border-white/15";

const blocked = (text: string) => Boolean(contentProblem(text));

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** A tap you can feel, in the iOS app, unless the reader asked for less motion. */
function feel(moment: "select" | "save") {
  if (!reducedMotion()) haptic(moment);
}

/**
 * The app's bottom sheet: slides up, swipes down to close, keeps Tab inside, closes on Escape and
 * on the backdrop, sits above the keyboard, and hands focus back to whatever opened it.
 */
function Sheet({ titleId, onClose, children }: { titleId: string; onClose: () => void; children: (dismiss: () => void) => ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dismiss = useSheetDrag(panelRef, rootRef, onClose);
  const { inset } = useKeyboardInset();
  useFocusTrap(panelRef);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismiss]);

  return (
    <div ref={rootRef} className="backdrop-in fixed inset-0 z-50 grid place-items-end bg-black/50 sm:place-items-center" onClick={dismiss}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-keyboard-inset={inset}
        onClick={(event) => event.stopPropagation()}
        style={inset > 0 ? { marginBottom: inset } : undefined}
        className="sheet-slide max-h-[min(88dvh,640px)] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--background)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none sm:rounded-3xl"
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-9 rounded-full bg-zinc-300 sm:hidden dark:bg-white/20" />
        {children(dismiss)}
      </div>
    </div>
  );
}

/** "12 / 280": quiet until the last 20, rose when over. Screen readers get the full sentence. */
function Counter({ length }: { length: number }) {
  const left = NOTE_MAX - length;
  const tone = left < 0 ? "text-rose-600 dark:text-rose-400" : left <= 20 ? "text-amber-600 dark:text-amber-400" : "text-zinc-500";
  return (
    <span className={`shrink-0 text-xs tabular-nums ${tone}`}>
      <span aria-hidden="true">
        {length}/{NOTE_MAX}
      </span>
      <span className="sr-only">{VOUCH_COPY.counter(length, NOTE_MAX)}</span>
    </span>
  );
}

/** The two-step remove: the first tap asks, the second does it. */
function RemoveConfirm({ title, body, confirm, busy, onCancel, onConfirm }: { title: string; body: string; confirm: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div role="alertdialog" aria-label={title} className="mt-4 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
      <p className="text-15 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{body}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={`${outlineButton} min-h-11`}>
          {VOUCH_COPY.cancel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          autoFocus
          className="inline-flex min-h-11 items-center rounded-full bg-rose-600 px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {confirm}
        </button>
      </div>
    </div>
  );
}

export type VouchSheetProps = {
  subject: { id: string; username: string };
  /** The vouch the reader already left: the sheet opens on it, to edit or remove. */
  mine?: VouchStatus["mine"];
  /** The two logged a confirmed deal: the vouch will carry the tag. Shown, never chosen here. */
  hasLoggedDeal?: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** Tests stand in for the store's writes here. */
  writes?: {
    upsert: (subjectId: string, rating: VouchRating, note: string, blocked?: (text: string) => boolean) => Promise<VouchWriteResult>;
    remove: (subjectId: string) => Promise<VouchWriteResult>;
  };
};

/** Leave a vouch, or edit or remove the one you left. */
export function VouchSheet({ subject, mine = null, hasLoggedDeal = false, onClose, onSaved, writes }: VouchSheetProps) {
  const { store } = useVouchStore();
  const save = writes ?? store;
  const titleId = useId();
  const noteId = useId();
  const helperId = useId();
  const [rating, setRating] = useState<VouchRating | null>(mine?.rating ?? null);
  const [note, setNote] = useState(mine?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const choices = useRef<(HTMLButtonElement | null)[]>([]);

  const editing = Boolean(mine);
  const length = vouchTextLength(note);
  const problem = rating ? vouchNoteProblem(rating, note, blocked) : null;
  const needsReason = rating === "neutral" || rating === "negative";
  const unchanged = editing && rating === mine?.rating && note.trim() === (mine?.note ?? "");
  const canSubmit = Boolean(rating) && !problem && !pending && !unchanged;
  // The reason line is a helper, not an error: it sits under the note until the note is long enough.
  const helper = needsReason && (problem === "vouch_note_required" || !problem) ? VOUCH_COPY.noteHelper : null;
  const complaint = problem && problem !== "vouch_note_required" ? vouchHintCopy(problem, subject.username) : null;

  function pick(next: VouchRating) {
    if (next !== rating) feel("select");
    setRating(next);
    setError(null);
  }

  /** Arrow keys move between the three choices, the way a radio group does. */
  function onChoiceKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + VOUCH_RATINGS.length) % VOUCH_RATINGS.length;
    pick(VOUCH_RATINGS[next]!);
    choices.current[next]?.focus();
  }

  async function finish(run: () => Promise<VouchWriteResult>, dismiss: () => void) {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await run().catch((): VouchWriteResult => ({ ok: false, error: VOUCH_COPY.failed, hint: null }));
    setPending(false);
    if (!result.ok) {
      // The hint's copy with this person's handle, never the database's own words.
      setError(result.hint ? vouchErrorCopy({ hint: result.hint }, subject.username) : result.error);
      setRemoving(false);
      return;
    }
    feel("save");
    onSaved?.();
    dismiss();
  }

  return (
    <Sheet titleId={titleId} onClose={onClose}>
      {(dismiss) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit && rating) void finish(() => save.upsert(subject.id, rating, note, blocked), dismiss);
          }}
        >
          <h2 id={titleId} className="text-lg leading-6 font-semibold">
            {VOUCH_COPY.sheetTitle(subject.username)}
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">{VOUCH_COPY.sheetSub}</p>

          <div role="radiogroup" aria-label={VOUCH_COPY.ratingLabel} className="mt-4 grid grid-cols-3 gap-2">
            {VOUCH_RATINGS.map((option, index) => {
              const Icon = RATING_ICON[option];
              const checked = option === rating;
              return (
                <button
                  key={option}
                  ref={(node) => {
                    choices.current[index] = node;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked || (!rating && index === 0) ? 0 : -1}
                  onClick={() => pick(option)}
                  onKeyDown={(event) => onChoiceKey(event, index)}
                  className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border text-sm font-medium transition-colors duration-150 motion-reduce:transition-none ${
                    checked
                      ? "border-violet-600 bg-violet-600/10 text-violet-700 dark:border-violet-400 dark:bg-violet-400/15 dark:text-[#A78BFA]"
                      : "border-zinc-300 text-zinc-700 dark:border-white/15 dark:text-zinc-300"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
                  {VOUCH_COPY.ratings[option]}
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <label htmlFor={noteId} className="sr-only">
              {VOUCH_COPY.noteLabel}
            </label>
            <textarea
              id={noteId}
              rows={3}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setError(null);
              }}
              placeholder={VOUCH_COPY.notePlaceholder}
              aria-describedby={helperId}
              aria-invalid={Boolean(complaint)}
              className={field}
            />
            <div id={helperId} className="mt-1.5 flex items-start justify-between gap-3">
              <p className={`min-h-5 text-13 leading-5 ${complaint ? "text-rose-600 dark:text-rose-400" : "text-zinc-500"}`}>{complaint ?? helper ?? ""}</p>
              <Counter length={length} />
            </div>
          </div>

          {hasLoggedDeal ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 text-13 leading-5 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300">
              <Handshake aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              {VOUCH_COPY.loggedDealNote(subject.username)}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}

          {removing ? (
            <RemoveConfirm
              title={VOUCH_COPY.removeConfirmTitle}
              body={VOUCH_COPY.removeConfirmBody}
              confirm={VOUCH_COPY.removeVouch}
              busy={pending}
              onCancel={() => setRemoving(false)}
              onConfirm={() => void finish(() => save.remove(subject.id), dismiss)}
            />
          ) : (
            <>
              <p className="mt-4 text-13 leading-5 text-zinc-500">{VOUCH_COPY.sheetFootnote(subject.username)}</p>
              <div className="mt-3 flex items-center gap-2">
                {editing ? (
                  <button type="button" onClick={() => setRemoving(true)} disabled={pending} className={quietDanger}>
                    {VOUCH_COPY.removeVouch}
                  </button>
                ) : null}
                <span className="flex-1" />
                <button type="button" onClick={() => dismiss()} className={`${outlineButton} min-h-11`}>
                  {VOUCH_COPY.cancel}
                </button>
                <button type="submit" disabled={!canSubmit} className={primaryButton}>
                  {pending ? VOUCH_COPY.busy : editing ? VOUCH_COPY.save : VOUCH_COPY.post}
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </Sheet>
  );
}

export type VouchReplySheetProps = {
  vouch: { id: string; note: string; reply: string | null };
  /** Who left the vouch being replied to. */
  voucherUsername: string;
  onClose: () => void;
  /** The reply as saved, or null when it was removed. */
  onSaved?: (reply: string | null) => void;
  writes?: { reply: (vouchId: string, text: string, blocked?: (text: string) => boolean) => Promise<VouchWriteResult> };
};

/** The subject's one public reply to a vouch: write it, edit it or take it off. */
export function VouchReplySheet({ vouch, voucherUsername, onClose, onSaved, writes }: VouchReplySheetProps) {
  const { store } = useVouchStore();
  const save = writes ?? store;
  const titleId = useId();
  const fieldId = useId();
  const helperId = useId();
  const [text, setText] = useState(vouch.reply ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState(false);

  const editing = Boolean(vouch.reply);
  const length = vouchTextLength(text);
  const problem = vouchReplyProblem(text, blocked);
  const complaint = problem ? vouchHintCopy(problem, voucherUsername) : null;
  const canSubmit = length > 0 && !problem && !pending && text.trim() !== (vouch.reply ?? "");

  async function finish(body: string, dismiss: () => void) {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await save.reply(vouch.id, body, blocked).catch((): VouchWriteResult => ({ ok: false, error: VOUCH_COPY.failed, hint: null }));
    setPending(false);
    if (!result.ok) {
      setError(result.hint ? vouchErrorCopy({ hint: result.hint }, voucherUsername) : result.error);
      setRemoving(false);
      return;
    }
    feel("save");
    onSaved?.(body.trim() ? body.replace(/\r\n/g, "\n").trim() : null);
    dismiss();
  }

  return (
    <Sheet titleId={titleId} onClose={onClose}>
      {(dismiss) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) void finish(text, dismiss);
          }}
        >
          <h2 id={titleId} className="text-lg leading-6 font-semibold">
            {VOUCH_COPY.replyTitle}
          </h2>
          {vouch.note ? (
            <p className="mt-2 line-clamp-3 border-l-2 border-zinc-200 pl-3 text-sm leading-5 text-zinc-500 dark:border-white/15">
              @{voucherUsername}: {vouch.note}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-zinc-500">@{voucherUsername}</p>
          )}
          <div className="mt-4">
            <label htmlFor={fieldId} className="sr-only">
              {VOUCH_COPY.replyLabel}
            </label>
            <textarea
              id={fieldId}
              rows={3}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setError(null);
              }}
              placeholder={VOUCH_COPY.replyPlaceholder}
              aria-describedby={helperId}
              aria-invalid={Boolean(complaint)}
              className={field}
            />
            <div id={helperId} className="mt-1.5 flex items-start justify-between gap-3">
              <p className={`min-h-5 text-13 leading-5 ${complaint ? "text-rose-600 dark:text-rose-400" : "text-zinc-500"}`}>{complaint ?? ""}</p>
              <Counter length={length} />
            </div>
          </div>

          {error ? (
            <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}

          {removing ? (
            <RemoveConfirm
              title={VOUCH_COPY.removeReplyConfirmTitle}
              body={VOUCH_COPY.removeReplyConfirmBody}
              confirm={VOUCH_COPY.removeReply}
              busy={pending}
              onCancel={() => setRemoving(false)}
              onConfirm={() => void finish("", dismiss)}
            />
          ) : (
            <>
              <p className="mt-4 text-13 leading-5 text-zinc-500">{VOUCH_COPY.replyFootnote}</p>
              <div className="mt-3 flex items-center gap-2">
                {editing ? (
                  <button type="button" onClick={() => setRemoving(true)} disabled={pending} className={quietDanger}>
                    {VOUCH_COPY.removeReply}
                  </button>
                ) : null}
                <span className="flex-1" />
                <button type="button" onClick={() => dismiss()} className={`${outlineButton} min-h-11`}>
                  {VOUCH_COPY.cancel}
                </button>
                <button type="submit" disabled={!canSubmit} className={primaryButton}>
                  {pending ? VOUCH_COPY.busy : editing ? VOUCH_COPY.save : VOUCH_COPY.postReply}
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </Sheet>
  );
}
