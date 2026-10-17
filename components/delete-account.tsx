"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSocial } from "@/components/social-provider";

export function DeleteAccount() {
  const router = useRouter();
  const { signOut } = useSocial();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  function close() {
    if (busy) return;
    setOpen(false);
    setTyped("");
    setError(null);
  }

  async function onDelete() {
    if (lock.current || typed !== "DELETE") return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/delete", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Couldn't delete your account.");
        lock.current = false;
        setBusy(false);
        return;
      }
      await signOut();
      router.replace("/?notice=account-deleted");
    } catch {
      setError("Couldn't delete your account.");
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-3xl border border-rose-300 bg-white p-4 dark:border-rose-400/30 dark:bg-white/[0.03]">
      <h2 className="text-sm font-bold text-rose-700 dark:text-rose-300">Delete account</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        Permanently delete your Slabhold account and everything stored for it.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-full border border-rose-400 px-4 py-2 text-sm font-semibold text-rose-700 dark:border-rose-400/40 dark:text-rose-300"
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
            <h2 id="delete-account-title" className="text-lg font-bold">
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
                className="rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onDelete()}
                disabled={busy || typed !== "DELETE"}
                className="rounded-full bg-rose-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
