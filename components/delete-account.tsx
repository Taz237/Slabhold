"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppleLogo } from "@/components/auth-social";
import { useSocial } from "@/components/social-provider";
import { DELETE_RESUME_PATH, isDeleteResume } from "@/lib/account/apple-delete-flow";
import { APPLE_FINISH_COPY, APPLE_FINISH_STEPS } from "@/lib/account/apple-sign-in";
import { isDeleteConfirmation } from "@/lib/account/delete-confirm";
import { clearNewCardDraft } from "@/lib/cards/new-card-draft";
import { isNativeApp } from "@/lib/ios/platform";

const FAILED = "Couldn't delete your account.";

export const APPLE_CONFIRM_COPY = {
  title: "Confirm with Apple",
  body: "You signed in with Apple. Continue with Apple once more and we'll remove Slabhold from your Apple Account as we delete everything.",
  note: "Nothing is deleted until you do.",
  action: "Continue with Apple",
  failed: "Couldn't open Apple. Your account is not deleted.",
} as const;

/** Continue with Apple, coming back to the delete screen. Its own chunk, loaded on tap. */
async function continueWithApple(next: string): Promise<boolean> {
  return import("@/lib/auth/oauth-start").then((mod) => mod.startOAuth("apple", next)).catch(() => false);
}

export function DeleteAccount({
  startApple = continueWithApple,
}: {
  /** Opens Continue with Apple. Tests pass a fake. */
  startApple?: (next: string) => Promise<boolean>;
}) {
  const router = useRouter();
  const { signOut } = useSocial();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The account is gone and it was a Sign in with Apple login: show how to finish with Apple.
  const [appleStep, setAppleStep] = useState(false);
  // DELETE was typed, and we can revoke the Apple token: Continue with Apple first. Nothing is deleted yet.
  const [needApple, setNeedApple] = useState(false);
  // Back from Apple and the delete is running: no form to show.
  const [resuming, setResuming] = useState(false);
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
    setNeedApple(false);
  }

  /** `resume`: back from Continue with Apple. DELETE was already typed, so it isn't asked again. */
  async function submit(resume: boolean) {
    if (lock.current) return;
    lock.current = true;
    setOpen(true);
    setBusy(true);
    setResuming(resume);
    setError(null);
    try {
      const response = await fetch(
        "/api/account/delete",
        resume
          ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resume: true }) }
          : { method: "POST" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        apple?: boolean;
        needApple?: boolean;
      };
      if (!response.ok) {
        setError(payload.error ?? FAILED);
        setNeedApple(false);
        setResuming(false);
        lock.current = false;
        setBusy(false);
        return;
      }
      if (payload.needApple === true) {
        setNeedApple(true);
        setResuming(false);
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
      setError(FAILED);
      setResuming(false);
      lock.current = false;
      setBusy(false);
    }
  }

  function onDelete() {
    if (!isDeleteConfirmation(typed)) return;
    void submit(false);
  }

  async function onContinueApple() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const ok = await startApple(DELETE_RESUME_PATH);
    if (!ok) setError(APPLE_CONFIRM_COPY.failed);
    // On the web the page is leaving, so the button stays busy. In the app the sheet is up.
    if (!ok || isNativeApp()) {
      lock.current = false;
      setBusy(false);
    }
  }

  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !isDeleteResume(window.location.search)) return;
    resumed.current = true;
    // Drop the query so a reload can't run it twice.
    window.history.replaceState(window.history.state, "", `${window.location.pathname}#delete-account`);
    void submit(true);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            {appleStep ? <AppleFinishStep onDone={() => void finish()} /> : needApple ? (
              <AppleConfirmStep busy={busy} error={error} onCancel={close} onContinue={() => void onContinueApple()} />
            ) : resuming ? (
              <div role="status">
                <h2 id="delete-account-title" className="text-lg font-semibold">
                  Deleting your account…
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  Keep this open. It takes a few seconds.
                </p>
              </div>
            ) : (
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
                onClick={onDelete}
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
 * DELETE is typed, and the login is Sign in with Apple: one more Continue with
 * Apple gives us the token to revoke. The account stays until they do.
 */
export function AppleConfirmStep({
  busy,
  error,
  onCancel,
  onContinue,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <h2 id="delete-account-title" className="text-lg font-semibold">
        {APPLE_CONFIRM_COPY.title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {APPLE_CONFIRM_COPY.body}{" "}
        <span className="font-medium text-zinc-950 dark:text-zinc-50">{APPLE_CONFIRM_COPY.note}</span>
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onContinue}
        disabled={busy}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white text-base font-medium text-black transition-opacity duration-150 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60 motion-reduce:transition-none dark:focus-visible:ring-offset-zinc-950"
      >
        <AppleLogo className="-mt-0.5 h-5 w-5" />
        {busy ? "Opening Apple…" : APPLE_CONFIRM_COPY.action}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="hit-44 mt-2 w-full rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
      >
        Cancel
      </button>
    </>
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
