"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSocial } from "@/components/social-provider";
import { APPLE_FINISH_COPY, APPLE_FINISH_STEPS } from "@/lib/account/apple-sign-in";
import { isDeleteConfirmation } from "@/lib/account/delete-confirm";
import { clearNewCardDraft } from "@/lib/cards/new-card-draft";

export function DeleteAccount() {
  const router = useRouter();
  const { signOut } = useSocial();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The account is gone and it was a Sign in with Apple login: show how to finish with Apple.
  const [appleStep, setAppleStep] = useState(false);
  const lock = useRef(false);

  async function finish() {
    clearNewCardDraft();
    await signOut();
    router.replace("/?notice=account-deleted");
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setTyped("");
    setError(null);
  }

  async function onDelete() {
    if (lock.current || !isDeleteConfirmation(typed)) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/delete", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; apple?: boolean };
      if (!response.ok) {
        setError(payload.error ?? "Couldn't delete your account.");
        lock.current = false;
        setBusy(false);
        return;
      }
      if (payload.apple === true) {
        setAppleStep(true);
        return;
      }
      await finish();
    } catch {
      setError("Couldn't delete your account.");
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section id="delete-account" className="mt-4 scroll-mt-20 rounded-3xl border border-rose-300 bg-white p-4 dark:border-rose-400/30 dark:bg-white/[0.03]">
      <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-300">Delete account</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        Permanently delete your Slabhold account and everything stored for it.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hit-44 mt-3 rounded-full border border-rose-400 px-4 py-2 text-sm font-semibold text-rose-700 dark:border-rose-400/40 dark:text-rose-300"
      >
        Delete account
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-zinc-950"
          >
            {appleStep ? <AppleFinishStep onDone={() => void finish()} /> : (
            <>
            <h2 id="delete-account-title" className="text-lg font-semibold">
              Delete account
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              This deletes your cards, posts, replies, likes, follows, DMs, want list, snapshots,
              and uploaded images. This can&apos;t be undone.
            </p>
            <label className="mt-4 block text-sm font-medium" htmlFor="delete-confirm">
              Type DELETE to confirm
            </label>
            <input
              id="delete-confirm"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-rose-500 dark:border-white/10"
            />
            {error ? (
              <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="hit-44 rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onDelete()}
                disabled={busy || !isDeleteConfirmation(typed)}
                className="hit-44 rounded-full bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * After a Sign in with Apple account is deleted: where to remove Slabhold from
 * the Apple Account, so nothing of the login is left with Apple either.
 */
export function AppleFinishStep({ onDone }: { onDone: () => void }) {
  return (
    <>
      <h2 id="delete-account-title" className="text-lg font-semibold">
        {APPLE_FINISH_COPY.title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{APPLE_FINISH_COPY.body}</p>
      <ol aria-label="Steps on your iPhone" className="mt-3 space-y-1">
        {APPLE_FINISH_STEPS.map((step, index) => (
          <li key={step} className="flex min-h-8 items-center gap-3 text-sm font-medium">
            <span aria-hidden className="w-4 shrink-0 text-right font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="hit-44 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-zinc-950"
        >
          {APPLE_FINISH_COPY.done}
        </button>
      </div>
    </>
  );
}
