"use client";

import { useState, type FormEvent } from "react";
import { flagReasonLabel } from "@/lib/comps/flag-reasons";
import { formatDate, money } from "@/lib/format";

type AdminFlag = {
  id: string;
  username: string;
  cardId: string;
  itemId: string;
  reason: string | null;
  title: string;
  price: number | null;
  soldAt: string | null;
};

export function CompFlagsAdmin() {
  const [query, setQuery] = useState("");
  const [flags, setFlags] = useState<AdminFlag[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function search(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    const q = query.trim();
    if (!q) {
      setFlags([]);
      return;
    }
    const res = await fetch(`/api/admin/comp-flags?q=${encodeURIComponent(q)}`);
    if (res.status === 404) {
      setStatus("Not available.");
      setFlags([]);
      return;
    }
    if (!res.ok) {
      setStatus("Search failed.");
      return;
    }
    const body = (await res.json()) as { flags?: AdminFlag[] };
    setFlags(body.flags ?? []);
    if (!body.flags?.length) setStatus("No flags.");
  }

  async function restore(id: string) {
    setBusy(id);
    setStatus(null);
    const res = await fetch("/api/admin/comp-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusy(null);
    if (!res.ok) {
      setStatus("Couldn't restore that flag.");
      return;
    }
    setFlags((current) => current.filter((flag) => flag.id !== id));
  }

  return (
    <div>
      <form onSubmit={(event) => void search(event)} className="flex gap-2 px-4 py-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Card id or username"
          aria-label="Card id or username"
          className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-white/10"
        />
        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-950"
        >
          Search
        </button>
      </form>
      {status ? <p className="px-4 pb-3 text-sm text-zinc-500">{status}</p> : null}
      <ul>
        {flags.map((flag) => (
          <li key={flag.id} className="border-b border-zinc-200 px-4 py-4 dark:border-white/10">
            <p className="text-sm font-semibold">{flag.title || "Sale"}</p>
            <p className="mt-1 text-sm text-zinc-500">
              {flag.username ? `@${flag.username}` : flag.cardId}
              {" · "}
              {flag.price != null ? money(flag.price) : "—"}
              {flag.soldAt ? ` · ${formatDate(flag.soldAt.slice(0, 10))}` : ""}
              {` · ${flagReasonLabel(flag.reason)}`}
            </p>
            <p className="mt-1 break-all text-xs text-zinc-400">{flag.cardId}</p>
            <button
              type="button"
              disabled={busy === flag.id}
              onClick={() => void restore(flag.id)}
              className="mt-2 text-sm font-bold text-violet-700 disabled:opacity-40 dark:text-violet-300"
            >
              {busy === flag.id ? "Restoring…" : "Restore"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
