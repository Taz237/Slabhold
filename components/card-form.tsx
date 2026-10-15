"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, ScanSearch, X } from "lucide-react";
import { useCollection, useDefaultAccent } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { takeScan } from "@/lib/capture";
import { CompsList } from "@/components/comps-list";
import { averageComp, identifyFromPhoto, mockCompsForCard } from "@/lib/comps";
import { fileToDataUrl } from "@/lib/storage";
import type { IdentifyResult, SportsCard } from "@/lib/types";

function localToday() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function CardForm({ existing }: { existing?: SportsCard }) {
  const router = useRouter();
  const { addCard, updateCard, removeCard } = useCollection();
  const { mode } = useSocial();
  const accent = useDefaultAccent();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(existing?.photoDataUrl ?? null);

  useEffect(() => {
    if (existing) return;
    const scanned = takeScan();
    if (scanned) setPhoto(scanned);
  }, [existing]);
  const [sold, setSold] = useState(Boolean(existing?.sellPrice));
  const [share, setShare] = useState(Boolean(existing?.isPublic));
  const [scanning, setScanning] = useState(false);
  const [identified, setIdentified] = useState<IdentifyResult | null>(null);
  const [form, setForm] = useState({
    playerName: existing?.playerName ?? "",
    year: existing?.year ?? new Date().getFullYear(),
    setBrand: existing?.setBrand ?? "",
    cardNumber: existing?.cardNumber ?? "",
    grade: existing?.grade ?? "",
    parallel: existing?.parallel ?? "",
    sport: existing?.sport ?? "Basketball",
    purchasePrice: existing ? String(existing.purchasePrice) : "",
    purchaseDate: existing?.purchaseDate ?? localToday(),
    estimatedSellPrice: existing ? String(existing.estimatedSellPrice) : "",
    sellPrice: existing?.sellPrice != null ? String(existing.sellPrice) : "",
    sellDate: existing?.sellDate ?? "",
    notes: existing?.notes ?? "",
  });

  const previewComps = useMemo(() => {
    if (identified) return identified.comps;
    if (!form.playerName) return [];
    return mockCompsForCard({
      playerName: form.playerName,
      year: Number(form.year) || 2020,
      setBrand: form.setBrand || "Unknown",
      cardNumber: form.cardNumber || "—",
      estimatedSellPrice: Number(form.estimatedSellPrice) || 120,
    });
  }, [form, identified]);

  async function scanFile(file: File | undefined) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setPhoto(dataUrl);
    setScanning(true);
    setIdentified(null);
    try {
      const result = await identifyFromPhoto();
      setIdentified(result);
    } finally {
      setScanning(false);
    }
  }

  function applyIdentify(result: IdentifyResult) {
    setForm((prev) => ({
      ...prev,
      playerName: result.playerName,
      year: result.year,
      setBrand: result.setBrand,
      cardNumber: result.cardNumber,
      sport: result.sport,
      estimatedSellPrice: String(result.estimatedSellPrice),
    }));
    setIdentified(result);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      playerName: form.playerName.trim(),
      year: Number(form.year),
      setBrand: form.setBrand.trim(),
      cardNumber: form.cardNumber.trim(),
      grade: form.grade.trim(),
      parallel: form.parallel.trim(),
      sport: form.sport,
      purchasePrice: Number(form.purchasePrice) || 0,
      purchaseDate: form.purchaseDate,
      estimatedSellPrice:
        Number(form.estimatedSellPrice) ||
        (previewComps.length ? averageComp(previewComps) : 0),
      sellPrice: sold && form.sellPrice ? Number(form.sellPrice) : null,
      sellDate: sold && form.sellDate ? form.sellDate : null,
      notes: form.notes.trim(),
      photoDataUrl: photo,
      accent: existing?.accent ?? accent,
      isPublic: share,
    };

    if (existing) {
      updateCard(existing.id, payload);
      router.push(`/cards/${existing.id}`);
    } else {
      const created = addCard(payload);
      router.push(`/cards/${created.id}`);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          {existing ? "Update position" : "New position"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {existing ? `Edit ${existing.playerName}` : "Add a card"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Player, set, what you paid, and a photo.{" "}
          {mode === "supabase" ? "Saved to your account." : "Saved in this browser."}
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.03] p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium">Photo & scan</p>
          {photo && (
            <button
              type="button"
              onClick={() => {
                setPhoto(null);
                setIdentified(null);
              }}
              className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-[112px_1fr]">
          <div
            className="relative overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-100 dark:border-white/15 dark:bg-black/30"
            style={{ aspectRatio: "5 / 7" }}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Card" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-zinc-600">
                <ImagePlus size={22} />
              </div>
            )}
            {scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 px-2 text-center">
                <Loader2 className="mb-2 animate-spin text-violet-300" size={20} />
                <p className="text-xs font-medium">Searching comps…</p>
                <p className="mt-1 text-[10px] text-zinc-400">
                  Matching recent eBay sold listings
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void scanFile(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950"
            >
              <Camera size={16} />
              Camera / upload
            </button>
            <button
              type="button"
              onClick={async () => {
                setScanning(true);
                try {
                  applyIdentify(await identifyFromPhoto());
                } finally {
                  setScanning(false);
                }
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              <ScanSearch size={16} />
              Mock identify
            </button>
            {identified && (
              <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-3">
                <p className="text-[11px] uppercase tracking-wider text-violet-700 dark:text-violet-300">
                  Possible match · {Math.round(identified.confidence * 100)}%
                </p>
                <p className="mt-1 text-sm font-medium">
                  {identified.year} {identified.setBrand} {identified.playerName} #
                  {identified.cardNumber}
                </p>
                <button
                  type="button"
                  onClick={() => applyIdentify(identified)}
                  className="mt-2 text-xs font-medium text-violet-700 dark:text-violet-300"
                >
                  Confirm this card
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <Field label="Player name">
        <input
          required
          value={form.playerName}
          onChange={(e) => setForm((prev) => ({ ...prev, playerName: e.target.value }))}
          className={inputClass}
          placeholder="Victor Wembanyama"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Year">
          <input
            required
            type="number"
            min={1900}
            max={2100}
            value={form.year}
            onChange={(e) => setForm((prev) => ({ ...prev, year: Number(e.target.value) }))}
            className={inputClass}
          />
        </Field>
        <Field label="Set / brand">
          <input
            required
            value={form.setBrand}
            onChange={(e) => setForm((prev) => ({ ...prev, setBrand: e.target.value }))}
            className={inputClass}
            placeholder="Panini Prizm"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Card number">
          <input
            value={form.cardNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, cardNumber: e.target.value }))}
            className={inputClass}
            placeholder="136"
          />
        </Field>
        <Field label="Sport">
          <select
            value={form.sport}
            onChange={(e) => setForm((prev) => ({ ...prev, sport: e.target.value }))}
            className={inputClass}
          >
            {["Basketball", "Football", "Baseball", "Hockey", "Soccer", "Other"].map(
              (sport) => (
                <option key={sport} value={sport}>
                  {sport}
                </option>
              ),
            )}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Grade">
          <input
            value={form.grade}
            onChange={(e) => setForm((prev) => ({ ...prev, grade: e.target.value }))}
            className={inputClass}
            placeholder="PSA 10, BGS 9.5, Raw"
          />
        </Field>
        <Field label="Parallel">
          <input
            value={form.parallel}
            onChange={(e) => setForm((prev) => ({ ...prev, parallel: e.target.value }))}
            className={inputClass}
            placeholder="Silver, Refractor, /99"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Purchase date">
          <input
            required
            type="date"
            value={form.purchaseDate}
            onChange={(e) => setForm((prev) => ({ ...prev, purchaseDate: e.target.value }))}
            className={inputClass}
          />
        </Field>
        <Field label="What you paid">
          <input
            required
            type="number"
            min={0}
            step="0.01"
            value={form.purchasePrice}
            onChange={(e) => setForm((prev) => ({ ...prev, purchasePrice: e.target.value }))}
            className={inputClass}
            placeholder="95"
          />
        </Field>
      </div>

      <Field label="Estimated sell price">
        <input
          type="number"
          min={0}
          step="0.01"
          value={form.estimatedSellPrice}
          onChange={(e) => setForm((prev) => ({ ...prev, estimatedSellPrice: e.target.value }))}
          className={inputClass}
          placeholder="185"
        />
      </Field>

      <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
        <input
          type="checkbox"
          checked={sold}
          onChange={(e) => setSold(e.target.checked)}
          className="accent-violet-500"
        />
        This card has been sold
      </label>

      <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
        <input
          type="checkbox"
          checked={share}
          onChange={(e) => setShare(e.target.checked)}
          className="accent-violet-500"
        />
        Show this card on your public profile
      </label>

      {sold && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Actual sell price">
            <input
              required={sold}
              type="number"
              min={0}
              step="0.01"
              value={form.sellPrice}
              onChange={(e) => setForm((prev) => ({ ...prev, sellPrice: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Sell date">
            <input
              required={sold}
              type="date"
              value={form.sellDate}
              onChange={(e) => setForm((prev) => ({ ...prev, sellDate: e.target.value }))}
              className={inputClass}
            />
          </Field>
        </div>
      )}

      <Field label="Notes">
        <textarea
          rows={4}
          value={form.notes}
          onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          className={`${inputClass} resize-y`}
          placeholder="Condition, centering, why you bought it…"
        />
      </Field>

      {previewComps.length > 0 && (
        <section className="rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.03] p-4">
          <p className="text-sm font-medium">Recent comps (mock eBay sold)</p>
          <p className="mt-1 text-xs text-zinc-500">
            Avg {averageComp(previewComps).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
          </p>
          <CompsList comps={previewComps} />
        </section>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {existing ? (
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete this card from your book?")) {
                removeCard(existing.id);
                router.push("/");
              }
            }}
            className="rounded-full px-4 py-3 text-sm text-rose-400 hover:bg-rose-400/10"
          >
            Delete card
          </button>
        ) : (
          <span />
        )}
        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950"
        >
          {existing ? "Save changes" : "Add to collection"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:[color-scheme:dark]";
