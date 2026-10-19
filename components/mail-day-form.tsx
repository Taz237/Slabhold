"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { createMailDayPost } from "@/app/mail-day/actions";
import { outlineButton, solidButton } from "@/components/button-styles";
import { CardSearch } from "@/components/card-search";
import { CategoryPicker } from "@/components/category-picker";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { NativeSelect, SearchSelect } from "@/components/search-select";
import {
  GRADE_COMPANIES,
  GRADE_NUMBERS,
  PARALLELS,
  SETS,
  yearOptionsForSport,
} from "@/lib/card-options";
import { SOURCE_LABELS, type AcquiredSource, type MailDayInput } from "@/lib/social/mail-day";
import { POST_LIMIT } from "@/lib/social/types";
import { fileToDataUrl } from "@/lib/storage";
import type { CardCategory, ConditionType } from "@/lib/types";

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100";

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function MailDayForm() {
  const router = useRouter();
  const { refresh } = useSocial();
  const { reload } = useCollection();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [yearLabel, setYearLabel] = useState("");
  const [setBrand, setSetBrand] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [parallel, setParallel] = useState("Base");
  const [sport, setSport] = useState("Basketball");
  const [conditionType, setConditionType] = useState<ConditionType>("raw");
  const [grader, setGrader] = useState("PSA");
  const [grade, setGrade] = useState("10");
  const [paid, setPaid] = useState("");
  const [source, setSource] = useState<AcquiredSource | "">("");
  const [category, setCategory] = useState<CardCategory>("flipping");
  const [isPublic, setIsPublic] = useState(false);
  const [showPaid, setShowPaid] = useState(false);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedCardId, setSavedCardId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const years = useMemo(() => yearOptionsForSport(sport), [sport]);
  const grades = GRADE_NUMBERS[grader] ?? GRADE_NUMBERS.Other;

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const next = [...photos];
    for (const file of Array.from(files)) {
      if (next.length >= 4) break;
      next.push(await fileToDataUrl(file, 960));
    }
    setPhotos(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSavedCardId(null);
    const input: MailDayInput = {
      playerName,
      yearLabel,
      setBrand,
      cardNumber,
      parallel,
      sport,
      conditionType,
      grader,
      grade,
      paid,
      source,
      category,
      isPublic,
      showPaid,
      caption,
      photos,
      acquiredAt: today(),
    };
    setSending(true);
    const result = await createMailDayPost(input);
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      if (result.cardSaved) {
        setSavedCardId(result.cardId);
        reload();
      }
      return;
    }
    reload();
    await refresh();
    router.push("/");
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <div>
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Pickup</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Mail Day</h1>
      </div>

      <CardSearch
        onSelect={(card) => {
          setPlayerName(card.playerName);
          setYearLabel(card.yearLabel);
          setSetBrand(card.setBrand);
          setCardNumber(card.cardNumber);
          setParallel(card.parallel || "Base");
          if (card.sport) setSport(card.sport);
        }}
        onManual={(prefill) => {
          if (prefill.playerName) setPlayerName(prefill.playerName);
          if (prefill.yearLabel) setYearLabel(prefill.yearLabel);
          if (prefill.cardNumber) setCardNumber(prefill.cardNumber);
        }}
      />

      <div>
        <p className="mb-2 text-sm font-semibold">Photos</p>
        <div className="grid grid-cols-4 gap-2">
          {photos.map((src) => (
            <div key={src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="aspect-square w-full rounded-xl object-cover" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => setPhotos((current) => current.filter((item) => item !== src))}
                className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {photos.length < 4 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid aspect-square place-items-center rounded-xl border border-dashed border-zinc-300 text-zinc-500 dark:border-white/15"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void addPhotos(event.target.files);
            event.target.value = "";
          }}
        />
        <p className="mt-1 text-xs text-zinc-500">1 to 4 photos</p>
      </div>

      <label className="block text-sm font-semibold">
        Player
        <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} className={`${inputClass} mt-1`} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-sm font-semibold">Year</p>
          <SearchSelect
            label="Year"
            value={yearLabel}
            options={years}
            allowCustom
            onChange={setYearLabel}
          />
        </div>
        <label className="block text-sm font-semibold">
          Number
          <input value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">Set</p>
        <SearchSelect label="Set" value={setBrand} options={SETS} allowCustom onChange={setSetBrand} />
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">Parallel</p>
        <SearchSelect label="Parallel" value={parallel} options={PARALLELS} allowCustom onChange={setParallel} />
      </div>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Condition">
        {(["raw", "graded"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={conditionType === option}
            onClick={() => setConditionType(option)}
            className={`min-h-11 rounded-full text-sm font-bold ${
              conditionType === option
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                : "border border-zinc-200 dark:border-white/10"
            }`}
          >
            {option === "raw" ? "Raw" : "Graded"}
          </button>
        ))}
      </div>
      {conditionType === "graded" ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-sm font-semibold">Grader</p>
            <NativeSelect label="Grader" value={grader} options={[...GRADE_COMPANIES]} onChange={setGrader} />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold">Grade</p>
            <NativeSelect label="Grade" value={grade} options={grades} onChange={setGrade} />
          </div>
        </div>
      ) : null}

      <label className="block text-sm font-semibold">
        Price paid
        <input
          inputMode="decimal"
          value={paid}
          onChange={(event) => setPaid(event.target.value)}
          placeholder="0.00"
          className={`${inputClass} mt-1`}
        />
      </label>
      <label className="block text-sm font-semibold">
        Source
        <select
          value={source}
          onChange={(event) => setSource(event.target.value as AcquiredSource | "")}
          className={`${inputClass} mt-1`}
        >
          <option value="">Where did you get it?</option>
          {(Object.keys(SOURCE_LABELS) as AcquiredSource[]).map((id) => (
            <option key={id} value={id}>
              {SOURCE_LABELS[id]}
            </option>
          ))}
        </select>
      </label>

      <CategoryPicker value={category} onChange={setCategory} />

      <label className="flex items-center justify-between gap-3 text-sm font-semibold">
        Public card
        <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm font-semibold">
        Show what I paid
        <input
          type="checkbox"
          checked={showPaid}
          onChange={(event) => setShowPaid(event.target.checked)}
        />
      </label>
      <p className="text-xs text-zinc-500">
        Paid stays on your card. It shows on the post only when this is on, and never when the card is private.
      </p>

      <label className="block text-sm font-semibold">
        Caption
        <textarea
          value={caption}
          maxLength={POST_LIMIT}
          rows={3}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="Optional"
          className={`${inputClass} mt-1 resize-none`}
        />
      </label>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
      {savedCardId ? (
        <Link href={`/cards/${savedCardId}`} className={outlineButton}>
          Open the saved card
        </Link>
      ) : null}
      <button type="submit" disabled={sending} className={solidButton}>
        {sending ? "Saving…" : "Log Mail Day"}
      </button>
    </form>
  );
}
