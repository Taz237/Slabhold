"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, ScanSearch, X } from "lucide-react";
import { CardSearch } from "@/components/card-search";
import { CategoryPicker } from "@/components/category-picker";
import { useCollection, useDefaultAccent } from "@/components/collection-provider";
import { NativeSelect, SearchSelect } from "@/components/search-select";
import { useSocial } from "@/components/social-provider";
import { takeScan } from "@/lib/capture";
import type { CatalogCard } from "@/lib/card-catalog";
import {
  GRADE_NUMBERS,
  GRADE_QUALIFIERS,
  SETS,
  SPORTS,
  isValidCardNumber,
  isValidYear,
  normalizeCardNumberInput,
  optionsWithCurrent,
  parseYearLabel,
  yearOptionsForSport,
} from "@/lib/card-options";
import {
  applyGradingCompany,
  estimateInputFromCard,
  gradeNumberFromGrade,
  gradingCompanyChange,
  gradingCompanyFromCard,
  gradingCompanyOptions,
} from "@/lib/cards/grading-company";
import { parallelAfterSetChange, parallelIsListed, parallelsForSet } from "@/lib/cards/parallels";
import { buildCompsQuery } from "@/lib/comps/match";
import { identifyFromPhoto } from "@/lib/comps/sample";
import { cardCategory } from "@/lib/card-category";
import { hasPaid } from "@/lib/format";
import { formatCardValueLabel, marketValueSummary } from "@/lib/value/format";
import { useCardValue } from "@/lib/value/use-card-values";
import { claimSubmit, isSaveTimeout, SAVE_TIMEOUT_MESSAGE, SaveTimeoutError } from "@/lib/save/attempt";
import { fileToDataUrl } from "@/lib/storage";
import type {
  CardCategory,
  IdentifyResult,
  SportsCard,
} from "@/lib/types";

const DEMO_IDENTIFY =
  process.env.NEXT_PUBLIC_ENABLE_DEMO_IDENTIFY === "true";

function negativePrice(value: string): boolean {
  if (value.trim() === "") return false;
  const n = Number(value);
  return Number.isFinite(n) && n < 0;
}

function parseOptionalPrice(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

export function CardForm({ existing }: { existing?: SportsCard }) {
  const router = useRouter();
  const { addCard, updateCard, removeCard } = useCollection();
  const { mode } = useSocial();
  const current = useCardValue(existing?.id ?? null);
  const currentValueLine = marketValueSummary(current.value);
  const accent = useDefaultAccent();
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  const pendingId = useRef<string | null>(existing?.id ?? null);
  const timedOutIds = useRef<Set<string>>(new Set());
  const [photo, setPhoto] = useState<string | null>(existing?.photoDataUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) return;
    const scanned = takeScan();
    if (scanned) setPhoto(scanned);
  }, [existing]);

  const [sold, setSold] = useState(Boolean(existing?.sellPrice));
  const [share, setShare] = useState(Boolean(existing?.isPublic));
  const [category, setCategory] = useState<CardCategory>(
    existing ? cardCategory(existing) : "pc",
  );
  const [scanning, setScanning] = useState(false);
  const [identified, setIdentified] = useState<IdentifyResult | null>(null);

  const initialCompany = gradingCompanyFromCard({
    grade: existing?.grade ?? "",
    conditionType: existing?.conditionType,
  });

  const [gradeCompany, setGradeCompany] = useState(initialCompany);
  const [gradeNumber, setGradeNumber] = useState(
    gradeNumberFromGrade(existing?.grade ?? ""),
  );
  const [gradeQualifier, setGradeQualifier] = useState(
    existing?.gradeQualifier ?? "",
  );
  const [certNumber, setCertNumber] = useState(existing?.certNumber ?? "");
  const [noNumber, setNoNumber] = useState(Boolean(existing?.noNumber));
  const [setIsCustom, setSetIsCustom] = useState(
    Boolean(existing?.setIsCustom),
  );
  const [parallelIsCustom, setParallelIsCustom] = useState(
    Boolean(existing?.parallelIsCustom),
  );
  const [parallelNote, setParallelNote] = useState("");
  const [isRookie, setIsRookie] = useState(Boolean(existing?.isRookie));
  const [isAuto, setIsAuto] = useState(Boolean(existing?.isAuto));
  const [isRelic, setIsRelic] = useState(Boolean(existing?.isRelic));
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const defaultYear = existing
    ? existing.yearLabel || String(existing.year)
    : "";

  const [form, setForm] = useState({
    playerName: existing?.playerName ?? "",
    yearLabel: defaultYear,
    setBrand: existing?.setBrand ?? "",
    cardNumber: existing?.cardNumber ?? "",
    parallel: existing?.parallel || "Base",
    serialRun: existing?.serialRun != null ? String(existing.serialRun) : "",
    serialNo: existing?.serialNo != null ? String(existing.serialNo) : "",
    sport: existing?.sport ?? "Basketball",
    purchasePrice: hasPaid(existing) ? String(existing!.purchasePrice) : "",
    purchaseDate: existing?.purchaseDate ?? "",
    estimatedSellPrice: estimateInputFromCard(existing?.estimatedSellPrice),
    sellPrice: existing?.sellPrice != null ? String(existing.sellPrice) : "",
    sellDate: existing?.sellDate ?? "",
    notes: existing?.notes ?? "",
  });

  const grading = applyGradingCompany({
    company: gradeCompany,
    gradeNumber,
  });
  const conditionType = grading.conditionType;
  const graded = conditionType === "graded";
  const gradeChoices = GRADE_NUMBERS[gradeCompany] ?? GRADE_NUMBERS.Other;
  const yearOptions = yearOptionsForSport(form.sport);

  const parsedYear = parseYearLabel(form.yearLabel);
  const cardNumberOk =
    noNumber || isValidCardNumber(form.cardNumber);
  const setOk = Boolean(form.setBrand.trim());
  const playerOk = Boolean(form.playerName.trim());
  const yearOk = Boolean(parsedYear);
  const companyMissing = !gradeCompany.trim();
  const gradeOk = !companyMissing && (!graded || Boolean(gradeNumber));
  const purchaseNeg = negativePrice(form.purchasePrice);
  const estNeg = negativePrice(form.estimatedSellPrice);
  const sellNeg = sold && negativePrice(form.sellPrice);

  const formValid =
    playerOk &&
    yearOk &&
    setOk &&
    cardNumberOk &&
    gradeOk &&
    !purchaseNeg &&
    !estNeg &&
    !sellNeg &&
    (!sold || (Boolean(form.sellPrice) && Boolean(form.sellDate) && !sellNeg));

  const preview = useMemo(() => {
    return buildCompsQuery({
      playerName: form.playerName.trim() || "Player",
      year: parsedYear?.year ?? 0,
      yearLabel: parsedYear?.yearLabel,
      setBrand: form.setBrand.trim() || "Set",
      cardNumber: noNumber
        ? undefined
        : normalizeCardNumberInput(form.cardNumber) || undefined,
      noNumber,
      parallel: form.parallel.trim() || "Base",
      serialRun: form.serialRun ? Number(form.serialRun) : null,
      isAuto,
      isRelic,
      conditionType,
      grade: grading.grade,
      gradeQualifier: gradeQualifier || null,
      isRookie,
    });
  }, [
    parsedYear,
    form.playerName,
    form.setBrand,
    form.cardNumber,
    form.parallel,
    form.serialRun,
    noNumber,
    isAuto,
    isRelic,
    isRookie,
    conditionType,
    grading.grade,
    gradeQualifier,
  ]);

  function markTouched(key: string) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function focusFirstInvalid() {
    const order = [
      !playerOk ? "playerName" : null,
      !setOk ? "setBrand" : null,
      !yearOk ? "yearLabel" : null,
      !cardNumberOk ? "cardNumber" : null,
      companyMissing ? "gradingCompany" : null,
      graded && !gradeNumber ? "grade" : null,
      purchaseNeg ? "purchasePrice" : null,
      estNeg ? "estimatedSellPrice" : null,
      sellNeg ? "sellPrice" : null,
      sold && !form.sellDate ? "sellDate" : null,
    ].filter(Boolean) as string[];
    const key = order[0];
    if (!key || !formRef.current) return;
    const el = formRef.current.querySelector<HTMLElement>(
      `[data-field="${key}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
  }

  async function scanFile(file: File | undefined) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setPhoto(dataUrl);
    if (!DEMO_IDENTIFY) return;
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
    const yl = String(result.year);
    setForm((prev) => ({
      ...prev,
      playerName: result.playerName,
      yearLabel: yl,
      setBrand: result.setBrand,
      cardNumber: result.cardNumber,
      sport: result.sport,
      estimatedSellPrice: String(result.estimatedSellPrice),
    }));
    setSetIsCustom(!SETS.some((s) => s === result.setBrand));
    setIdentified(result);
  }

  function applyCatalog(card: CatalogCard) {
    setForm((prev) => ({
      ...prev,
      playerName: card.playerName,
      yearLabel: card.yearLabel,
      setBrand: card.setBrand,
      cardNumber: card.cardNumber,
      sport: card.sport,
      parallel: card.parallel || "Base",
    }));
    setSetIsCustom(!SETS.some((s) => s === card.setBrand));
    setParallelIsCustom(!parallelIsListed(card.setBrand, card.parallel || "Base"));
    setParallelNote("");
    setIdentified(null);
  }

  function applyManualSearch(prefill: {
    playerName: string;
    yearLabel: string;
    cardNumber: string;
  }) {
    // Clear catalog leftovers, then prefill only what the query parsed.
    setForm((prev) => ({
      ...prev,
      playerName: prefill.playerName,
      yearLabel: prefill.yearLabel,
      setBrand: "",
      cardNumber: prefill.cardNumber,
      parallel: "Base",
    }));
    setSetIsCustom(false);
    setParallelIsCustom(false);
    setIdentified(null);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>(
        '[data-field="playerName"]',
      );
      el?.focus();
    });
  }

  function chooseGradeCompany(company: string) {
    setGradeCompany(company);
    markTouched("grade");
    setGradeNumber((current) =>
      gradingCompanyChange({
        company,
        gradeNumber: current,
        estimate: "",
      }).gradeNumber,
    );
    setForm((prev) => ({
      ...prev,
      estimatedSellPrice: gradingCompanyChange({
        company,
        gradeNumber: "",
        estimate: prev.estimatedSellPrice,
      }).estimate,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!claimSubmit(savingRef)) return;
    setTouched({
      playerName: true,
      yearLabel: true,
      setBrand: true,
      cardNumber: true,
      grade: true,
      purchasePrice: true,
      estimatedSellPrice: true,
      sellPrice: true,
      purchaseDate: true,
      sellDate: true,
    });
    if (!formValid || !parsedYear) {
      savingRef.current = false;
      requestAnimationFrame(() => focusFirstInvalid());
      return;
    }

    const grade = grading.grade;

    const payload = {
      playerName: form.playerName.trim(),
      year: parsedYear.year,
      yearLabel: parsedYear.yearLabel,
      setBrand: form.setBrand.trim(),
      setIsCustom,
      cardNumber: noNumber
        ? ""
        : normalizeCardNumberInput(form.cardNumber),
      noNumber,
      grade,
      parallel: (form.parallel.trim() || "Base"),
      parallelIsCustom,
      serialRun: form.serialRun ? Number(form.serialRun) : null,
      serialNo: form.serialNo ? Number(form.serialNo) : null,
      isRookie,
      isAuto,
      isRelic,
      conditionType,
      gradeQualifier: conditionType === "graded" ? gradeQualifier : "",
      certNumber: conditionType === "graded" ? certNumber.trim() : "",
      sport: form.sport,
      purchasePrice: parseOptionalPrice(form.purchasePrice),
      purchaseDate: form.purchaseDate,
      estimatedSellPrice: Number(form.estimatedSellPrice) || 0,
      sellPrice: sold && form.sellPrice ? Number(form.sellPrice) : null,
      sellDate: sold && form.sellDate ? form.sellDate : null,
      notes: form.notes.trim(),
      photoDataUrl: photo,
      accent: existing?.accent ?? accent,
      category,
      isPublic: share,
    };

    setSaving(true);
    setSaveError(null);
    let createdId: string | null = null;
    try {
      const reuseId = existing?.id ?? pendingId.current;
      const { card, saved } = reuseId
        ? updateCard(reuseId, payload)
        : addCard(payload);
      if (!existing) {
        pendingId.current = card.id;
        createdId = card.id;
      }
      await saved;
      createdId = null;
      router.push(`/cards/${card.id}`);
    } catch (error) {
      if (isSaveTimeout(error)) {
        if (createdId) timedOutIds.current.add(createdId);
        if (error instanceof SaveTimeoutError && error.photoUrl) setPhoto(error.photoUrl);
        setSaveError(SAVE_TIMEOUT_MESSAGE);
        setSaving(false);
        savingRef.current = false;
        return;
      }
      const timedOut = createdId != null && timedOutIds.current.has(createdId);
      if (createdId && !timedOut) removeCard(createdId);
      if (!existing && !timedOut) pendingId.current = null;
      setSaveError(
        error instanceof Error ? error.message : "Could not save this card.",
      );
      setSaving(false);
      savingRef.current = false;
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="mx-auto max-w-xl space-y-5">
      <div>
        <p
          className={
            existing
              ? "text-xs uppercase tracking-[0.2em] text-zinc-500"
              : "text-sm font-medium text-zinc-500"
          }
        >
          {existing ? "Update position" : "Add a card"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {existing ? `Edit ${existing.playerName}` : "Add a card"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Player, set, what you paid, and a photo.{" "}
          {mode === "supabase"
            ? "Saved to your account."
            : "Saved in this browser."}
        </p>
      </div>

      <CategoryPicker value={category} onChange={setCategory} />

      {!existing ? (
        <CardSearch onSelect={applyCatalog} onManual={applyManualSearch} />
      ) : null}

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
                <p className="text-xs font-medium">Demo lookup…</p>
                <p className="mt-1 text-[10px] text-zinc-400">
                  Sample match, not a real scan
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
            {DEMO_IDENTIFY ? (
              <>
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
                  Demo identify
                </button>
                <p className="text-xs leading-5 text-zinc-500">
                  Demo only. This doesn’t read the photo yet.
                </p>
                {identified && (
                  <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-violet-700 dark:text-violet-300">
                      Demo match · {Math.round(identified.confidence * 100)}%
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {identified.year} {identified.setBrand}{" "}
                      {identified.playerName} #{identified.cardNumber}
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
              </>
            ) : null}
          </div>
        </div>
      </section>

      <Field
        label="Player name"
        required
        error={
          touched.playerName && !playerOk ? "Player name is required" : null
        }
      >
        <input
          data-field="playerName"
          value={form.playerName}
          onBlur={() => markTouched("playerName")}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, playerName: e.target.value }))
          }
          className={inputClass}
          placeholder="Victor Wembanyama"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Year"
          required
          error={
            touched.yearLabel && !yearOk
              ? form.yearLabel.trim() === ""
                ? "Year is required"
                : "Use 2026 or 2023-24"
              : null
          }
        >
          <SearchSelect
            label="Year"
            value={form.yearLabel}
            options={
              form.yearLabel && isValidYear(form.yearLabel)
                ? optionsWithCurrent(yearOptions, form.yearLabel)
                : yearOptions
            }
            placeholder="Select"
            allowCustom
            isCustomValid={isValidYear}
            customInvalidHint="Use 2026 or 2023-24"
            dataField="yearLabel"
            onChange={(yearLabel) => {
              markTouched("yearLabel");
              setForm((prev) => ({ ...prev, yearLabel }));
            }}
          />
        </Field>
        <Field label="Sport">
          <NativeSelect
            label="Sport"
            value={form.sport}
            options={optionsWithCurrent(SPORTS, form.sport)}
            onChange={(sport) => {
              setForm((prev) => ({ ...prev, sport }));
            }}
          />
        </Field>
      </div>

      <Field
        label="Set / product"
        required
        error={touched.setBrand && !setOk ? "Set is required" : null}
      >
        <SearchSelect
          label="Set / product"
          value={form.setBrand}
          options={optionsWithCurrent(SETS, form.setBrand)}
          placeholder="Select a set"
          allowCustom
          dataField="setBrand"
          onChange={(setBrand) => {
            markTouched("setBrand");
            const known = SETS.some(
              (s) => s.toLowerCase() === setBrand.toLowerCase(),
            );
            setSetIsCustom(Boolean(setBrand) && !known);
            const next = parallelAfterSetChange({
              parallel: form.parallel,
              parallelIsCustom,
              setBrand,
            });
            setParallelIsCustom(next.parallelIsCustom);
            setParallelNote(next.reset ? "Parallel reset for this set" : "");
            setForm((prev) => ({ ...prev, setBrand, parallel: next.parallel }));
          }}
        />
      </Field>

      <div className="space-y-2">
        <Field
          label="Card number"
          required={!noNumber}
          error={
            touched.cardNumber && !noNumber && !cardNumberOk
              ? "Enter a card number (letters, digits, dashes) or check No number"
              : null
          }
        >
          <input
            value={form.cardNumber}
            disabled={noNumber}
            data-field="cardNumber"
            onBlur={() => markTouched("cardNumber")}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                cardNumber: e.target.value.replace(/^#/, ""),
              }))
            }
            className={`${inputClass} disabled:opacity-50`}
            placeholder="AS22, BCP-1, 136"
            aria-label="Card number"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={noNumber}
            onChange={(e) => {
              setNoNumber(e.target.checked);
              if (e.target.checked) {
                setForm((prev) => ({ ...prev, cardNumber: "" }));
              }
            }}
            className="accent-violet-500"
          />
          No number on card
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Parallel">
          <SearchSelect
            label="Parallel"
            value={form.parallel}
            options={optionsWithCurrent([...parallelsForSet(form.setBrand)], form.parallel)}
            placeholder="Base"
            allowCustom
            onChange={(parallel) => {
              const value = parallel || "Base";
              setParallelIsCustom(!parallelIsListed(form.setBrand, value));
              setParallelNote("");
              setForm((prev) => ({
                ...prev,
                parallel: value,
              }));
            }}
          />
          {parallelNote ? <p className="mt-1 text-xs text-zinc-500">{parallelNote}</p> : null}
        </Field>
        <Field label="Serial run">
          <div className="flex items-center gap-1">
            <span className="text-sm text-zinc-500">/</span>
            <input
              type="number"
              min={1}
              step={1}
              value={form.serialRun}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, serialRun: e.target.value }))
              }
              className={inputClass}
              placeholder="10"
              aria-label="Serial run"
            />
          </div>
        </Field>
      </div>

      <Field label="Serial number">
        <input
          type="number"
          min={1}
          step={1}
          value={form.serialNo}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, serialNo: e.target.value }))
          }
          className={inputClass}
          placeholder="7 (optional)"
        />
      </Field>

      <div className="flex flex-wrap gap-4">
        <Toggle
          label="Rookie"
          checked={isRookie}
          onChange={setIsRookie}
        />
        <Toggle label="Auto" checked={isAuto} onChange={setIsAuto} />
        <Toggle
          label="Patch / Relic"
          checked={isRelic}
          onChange={setIsRelic}
        />
      </div>

      <Field
        label="Grading company"
        required
        error={companyMissing ? "Choose a grading company" : null}
      >
        <NativeSelect
          label="Grading company"
          value={gradeCompany}
          options={gradingCompanyOptions(gradeCompany)}
          placeholder={companyMissing ? "Choose a grading company" : undefined}
          dataField="gradingCompany"
          onChange={chooseGradeCompany}
        />
      </Field>

      {graded ? (
        <div className="space-y-3">
          <Field
            label="Grade"
            required
            error={touched.grade && !gradeNumber ? "Choose a grade" : null}
          >
            <NativeSelect
              label="Grade"
              value={gradeNumber}
              options={gradeChoices}
              placeholder="Select"
              dataField="grade"
              onChange={(number) => {
                markTouched("grade");
                setGradeNumber(number);
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cert #">
              <input
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
                className={inputClass}
                placeholder="Optional"
              />
            </Field>
            <Field label="Qualifier">
              <NativeSelect
                label="Qualifier"
                value={gradeQualifier}
                options={GRADE_QUALIFIERS}
                placeholder="None"
                onChange={setGradeQualifier}
              />
            </Field>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Purchase date">
          <input
            type="date"
            data-field="purchaseDate"
            value={form.purchaseDate}
            onBlur={() => markTouched("purchaseDate")}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, purchaseDate: e.target.value }))
            }
            className={inputClass}
          />
        </Field>
        <Field
          label="What you paid"
          error={
            touched.purchasePrice && purchaseNeg
              ? "Price can't be negative"
              : null
          }
        >
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.purchasePrice}
            onBlur={() => markTouched("purchasePrice")}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, purchasePrice: e.target.value }))
            }
            className={inputClass}
            placeholder="Optional"
          />
        </Field>
      </div>

      {existing ? (
        <p className="min-w-0 text-sm font-medium text-zinc-700 tabular-nums whitespace-nowrap dark:text-zinc-200">
          {current.loading
            ? "Current value …"
            : (currentValueLine ??
              formatCardValueLabel(current.value, { createdAt: existing.createdAt }))}
        </p>
      ) : null}

      <Field
        label="Your estimate"
        error={
          touched.estimatedSellPrice && estNeg
            ? "Price can't be negative"
            : null
        }
      >
        <input
          type="number"
          min={0}
          step="0.01"
          value={form.estimatedSellPrice}
          onBlur={() => markTouched("estimatedSellPrice")}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              estimatedSellPrice: e.target.value,
            }))
          }
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
          <Field
            label="Actual sell price"
            required
            error={
              touched.sellPrice && sellNeg
                ? "Price can't be negative"
                : null
            }
          >
            <input
              type="number"
              min={0}
              step="0.01"
              data-field="sellPrice"
              value={form.sellPrice}
              onBlur={() => markTouched("sellPrice")}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, sellPrice: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Sell date" required>
            <input
              type="date"
              data-field="sellDate"
              value={form.sellDate}
              onBlur={() => markTouched("sellDate")}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, sellDate: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
        </div>
      )}

      <Field label="Notes">
        <textarea
          rows={4}
          value={form.notes}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, notes: e.target.value }))
          }
          className={`${inputClass} resize-y`}
          placeholder="Condition, centering, why you bought it…"
        />
      </Field>

      <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200">
        <span className="text-xs tracking-wide text-zinc-500 uppercase">
          Preview
        </span>
        <span className="mt-1 block font-medium">{preview}</span>
      </p>

      {saveError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-rose-600 dark:text-rose-400">{saveError}</p>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-11 items-center justify-center rounded-full border border-rose-300 px-4 text-sm font-semibold text-rose-700 disabled:opacity-40 dark:border-rose-400/40 dark:text-rose-300"
          >
            Retry
          </button>
        </div>
      ) : null}

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
          disabled={saving}
          onMouseDown={(e) => {
            // Keep focus so onBlur validation cannot swallow the first click.
            if (e.button === 0) e.preventDefault();
          }}
          className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-950"
        >
          {saving
            ? existing
              ? "Saving…"
              : "Adding…"
            : existing
              ? "Save changes"
              : "Add to collection"}
        </button>
      </div>
    </form>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-violet-500"
      />
      {label}
    </label>
  );
}

function Field({
  label,
  children,
  required,
  error,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string | null;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm text-zinc-500">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </p>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:[color-scheme:dark]";
