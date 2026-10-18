"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useSocial } from "@/components/social-provider";
import { cardIdentityKey, type IdentityCard } from "@/lib/social/card-identity";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { isUuid } from "@/lib/value/card-value-access";
import { wantLabel } from "@/lib/wants/label";
import { parseTargetPrice } from "@/lib/wants/target-price";

type SavedWant = {
  id: string;
  targetPrice: number | null;
};

export function WantButton({ card }: { card: IdentityCard & { id: string } }) {
  const { user } = useSocial();
  const [want, setWant] = useState<SavedWant | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cardKey = cardIdentityKey(card);

  useEffect(() => {
    if (!user) {
      setWant(null);
      return;
    }
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    void supabase
      .from("want_list")
      .select("id, target_price")
      .eq("user_id", user.id)
      .eq("card_key", cardKey)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) {
          setWant(null);
          return;
        }
        setWant({
          id: data.id as string,
          targetPrice: data.target_price == null ? null : Number(data.target_price),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [cardKey, user]);

  if (!user) return null;

  function openEditor() {
    setDraft(want?.targetPrice != null ? String(want.targetPrice) : "");
    setError(null);
    setOpen((current) => !current);
  }

  async function save() {
    const parsed = parseTargetPrice(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setError("Want list isn't available right now.");
      return;
    }
    setSaving(true);
    const { data, error: saveError } = await supabase
      .from("want_list")
      .upsert(
        {
          user_id: user!.id,
          card_key: cardKey,
          source_card_id: isUuid(card.id) ? card.id : null,
          label: wantLabel(card) || card.playerName || "Card",
          target_price: parsed.value,
        },
        { onConflict: "user_id,card_key" },
      )
      .select("id, target_price")
      .single();
    setSaving(false);
    if (saveError || !data) {
      setError(saveError?.message ?? "Couldn't save that want.");
      return;
    }
    setWant({
      id: data.id as string,
      targetPrice: data.target_price == null ? null : Number(data.target_price),
    });
    setError(null);
    setOpen(false);
  }

  async function remove() {
    if (!want) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    setSaving(true);
    const { error: deleteError } = await supabase.from("want_list").delete().eq("id", want.id);
    setSaving(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setWant(null);
    setDraft("");
    setError(null);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={Boolean(want)}
        aria-label={want ? "Edit want" : "Want this card"}
        onClick={openEditor}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
          want
            ? "bg-amber-400/20 text-amber-800 dark:text-amber-200"
            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15"
        }`}
      >
        <Star className={`h-4 w-4 ${want ? "fill-current" : ""}`} />
        Want
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-zinc-950">
          <label className="block text-xs font-medium text-zinc-500" htmlFor={`want-price-${card.id}`}>
            Target price (optional)
          </label>
          <input
            id={`want-price-${card.id}`}
            inputMode="decimal"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            placeholder="35"
            className="mt-1 w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-white/10"
          />
          {error ? (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
          ) : null}
          <div className="mt-3 flex items-center justify-between gap-2">
            {want ? (
              <button
                type="button"
                onClick={() => void remove()}
                disabled={saving}
                className="text-sm font-semibold text-rose-600 disabled:opacity-40 dark:text-rose-400"
              >
                Remove
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-950"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
