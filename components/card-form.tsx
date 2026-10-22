"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScanSearch } from "lucide-react";
import { CardPhotoField } from "@/components/card-photo-field";
import { CardSearch } from "@/components/card-search";
import { CategoryPicker } from "@/components/category-picker";
import { useCollection, useDefaultAccent } from "@/components/collection-provider";
import { NativeSelect, SearchSelect, SET_PARALLEL_HINT } from "@/components/search-select";
import { useSocial } from "@/components/social-provider";
import { toPublicAttachment } from "@/lib/social/card-posts";
import { sharePostFromCard, shareSessionStore, shareToFeedControl, writeSharedPost } from "@/lib/social/share-to-feed";
import { POST_LIMIT } from "@/lib/social/types";
import { takeScan } from "@/lib/capture";
import type { CatalogCard } from "@/lib/card-catalog";
import {
  catalogPickStillMatches,
  shouldSubmitCatalogCard,
  submitCatalogCardQuietly,
  type CatalogPickSnapshot,
} from "@/lib/catalog/catalog-queue";
import {
  GRADE_QUALIFIERS,
  SETS,
  SPORT_PICKER_OPTIONS,
  gradeSelectOptions,
  isValidCardNumber,
  isValidYear,
  normalizeCardNumberInput,
  optionsWithCurrent,
  parseYearLabel,
  sortSetNames,
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
import { todayDateInput } from "@/lib/cards/form-defaults";
import { cardFormPreview } from "@/lib/cards/form-preview";
import {
  rememberFirstCardPrivacy,
  shouldMarkFirstCardPrivacy,
} from "@/lib/collection/first-card-privacy";
import {
  parallelAfterSetChange,
  parallelChoice,
  parallelsForSet,
} from "@/lib/cards/parallels";
import {
  mailDaySportLabel,
  rookieAfterCatalogPick,
  sportAfterCatalogPick,
  textLooksRookie,
} from "@/lib/social/mail-day";
import { identifyFromPhoto } from "@/lib/comps/sample";
import { OpenToOffersToggle } from "@/components/open-to-offers";
import { cardCategory } from "@/lib/card-category";
import { showOpenToOffersToggle } from "@/lib/offers/open-to-offers";
import { parseManualPrefill } from "@/lib/card-search-query";
import { hasPaid } from "@/lib/format";
import { formatCardValueLabel, marketValueSummary } from "@/lib/value/format";
import { useCardValue } from "@/lib/value/use-card-values";
import { claimSubmit, isSaveTimeout, SAVE_TIMEOUT_MESSAGE, SaveTimeoutError } from "@/lib/save/attempt";
import { PHOTO_READ_ERROR, readPhotoFile } from "@/lib/photos";
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

export function CardForm({
  existing,
  embedded = false,
  onCancel,
  onSaved,
  initialQuery = "",
}: {
  existing?: SportsCard;
  /** Inline on the card page: skip the extra title, keep the same save. */
  embedded?: boolean;
  onCancel?: () => void;
  onSaved?: () => void;
  /** Search text to prefill when Add card was opened from a miss. */
  initialQuery?: string;
}) {
  const router = useRouter();
  const { addCard, updateCard, removeCard, cards, ready: cardsReady, syncError } = useCollection();
  const { mode, user, createPost } = useSocial();
  const current = useCardValue(existing?.id ?? null);
  const currentValueLine = marketValueSummary(current.value);
  const accent = useDefaultAccent();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const photoSource = useRef<"camera" | "library">("library");
  const photoReadId = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  const pendingId = useRef<string | null>(existing?.id ?? null);
  const catalogPick = useRef<CatalogPickSnapshot | null>(null);
  const timedOutIds = useRef<Set<string>>(new Set());
  const [photo, setPhoto] = useState<string | null>(existing?.photoDataUrl ?? null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) return;
    const scanned = takeScan();
    if (scanned) setPhoto(scanned);
  }, [existing]);

  const [sold, setSold] = useState(Boolean(existing?.sellPrice));
  const [share, setShare] = useState(Boolean(existing?.isPublic));
  const offersKnown = existing?.openToOffers != null;
  const [openToOffers, setOpenToOffers] = useState(existing?.openToOffers === true);
  const [shareToFeed, setShareToFeed] = useState(false);
  const [caption, setCaption] = useState("");
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
  const [sportOffer, setSportOffer] = useState("");
  const [sportTouched, setSportTouched] = useState(Boolean(existing));
  const [isRookie, setIsRookie] = useState(Boolean(existing?.isRookie));
  const [isAuto, setIsAuto] = useState(Boolean(existing?.isAuto));
  const [isRelic, setIsRelic] = useState(Boolean(existing?.isRelic));
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const manualPrefill =
    !existing && initialQuery.trim() ? parseManualPrefill(initialQuery) : null;

  const defaultYear = existing
    ? existing.yearLabel || String(existing.year)
    : (manualPrefill?.yearLabel ?? "");

  const [form, setForm] = useState({
    playerName: existing?.playerName ?? manualPrefill?.playerName ?? "",
    yearLabel: defaultYear,
    setBrand: existing?.setBrand ?? "",
    cardNumber: existing?.cardNumber ?? manualPrefill?.cardNumber ?? "",
    parallel: existing?.parallel || "Base",
    serialRun: existing?.serialRun != null ? String(existing.serialRun) : "",
    serialNo: existing?.serialNo != null ? String(existing.serialNo) : "",
    sport: existing?.sport ?? "Basketball",
    purchasePrice: hasPaid(existing) ? String(existing!.purchasePrice) : "",
    purchaseDate: existing ? (existing.purchaseDate ?? "") : todayDateInput(),
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
  const gradeChoices = gradeSelectOptions(gradeCompany, gradeNumber);
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
    return cardFormPreview({
      playerName: form.playerName,
      year: parsedYear?.year ?? 0,
      yearLabel: parsedYear?.yearLabel,
      setBrand: form.setBrand,
      cardNumber: noNumber
        ? undefined
        : normalizeCardNumberInput(form.cardNumber) || undefined,
      noNumber,
      parallel: form.parallel,
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

  function openCamera() {
    photoSource.current = "camera";
    cameraRef.current?.click();
  }

  function openLibrary() {
    photoSource.current = "library";
    libraryRef.current?.click();
  }

  function retryPhoto() {
    if (photoSource.current === "camera") openCamera();
    else openLibrary();
  }

  function clearPhoto() {
    photoReadId.current += 1;
    setReadingPhoto(false);
    setPhoto(null);
    setIdentified(null);
    setPhotoError(null);
  }

  async function scanFile(file: File | undefined) {
    if (!file) return;
    const requestId = ++photoReadId.current;
    setPhotoError(null);
    setReadingPhoto(true);
    let dataUrl: string;
    try {
      dataUrl = await readPhotoFile(file);
    } catch (error) {
      if (photoReadId.current !== requestId) return;
      setPhotoError(error instanceof Error ? error.message : PHOTO_READ_ERROR);
      return;
    } finally {
      if (photoReadId.current === requestId) setReadingPhoto(false);
    }
    if (photoReadId.current !== requestId) return;
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
    const sport = sportAfterCatalogPick(sportTouched ? form.sport : "", result.sport);
    setSportOffer(sport.offer);
    setForm((prev) => ({
      ...prev,
      playerName: result.playerName,
      yearLabel: yl,
      setBrand: result.setBrand,
      cardNumber: result.cardNumber,
      sport: sport.sport,
      estimatedSellPrice: String(result.estimatedSellPrice),
    }));
    setIsRookie((current) => current || textLooksRookie(`${result.playerName} ${result.setBrand}`));
    setSetIsCustom(!SETS.some((s) => s === result.setBrand));
    setIdentified(result);
  }

  function applyCatalog(card: CatalogCard) {
    const chosen = parallelChoice(card.setBrand, card.parallel || "Base");
    const sport = sportAfterCatalogPick(sportTouched ? form.sport : "", card.sport);
    setSportOffer(sport.offer);
    catalogPick.current = {
      playerName: card.playerName,
      yearLabel: card.yearLabel,
      setBrand: card.setBrand,
      cardNumber: card.cardNumber,
      parallel: chosen.parallel,
    };
    setForm((prev) => ({
      ...prev,
      playerName: card.playerName,
      yearLabel: card.yearLabel,
      setBrand: card.setBrand,
      cardNumber: card.cardNumber,
      sport: sport.sport,
      parallel: chosen.parallel,
    }));
    setIsRookie((current) => rookieAfterCatalogPick(current, card));
    setSetIsCustom(!SETS.some((s) => s === card.setBrand));
    setParallelIsCustom(chosen.parallelIsCustom);
    setParallelNote("");
    setIdentified(null);
  }

  function applyManualSearch(prefill: {
    playerName: string;
    yearLabel: string;
    cardNumber: string;
  }) {
    catalogPick.current = null;
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

  function cancelEdit() {
    if (onCancel) onCancel();
    else if (existing) router.push(`/cards/${existing.id}`);
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
    const parallel = parallelChoice(form.setBrand, form.parallel);

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
      parallel: parallel.parallel,
      parallelIsCustom: parallel.parallelIsCustom,
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
      ...(offersKnown ? { openToOffers: Boolean(share && openToOffers) } : {}),
    };

    setSaving(true);
    setSaveError(null);
    let createdId: string | null = null;
    const offerPrivacy = shouldMarkFirstCardPrivacy({
      isNew: !existing,
      isPublic: payload.isPublic,
      cardCountBeforeSave: cards.length,
      cardsReady,
      syncError,
    });
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
      if (offerPrivacy && user) rememberFirstCardPrivacy(user.id, card.id);
      if (mode === "supabase") {
        const picked = catalogPickStillMatches(catalogPick.current, {
          playerName: payload.playerName,
          yearLabel: payload.yearLabel,
          setBrand: payload.setBrand,
          cardNumber: payload.cardNumber,
          parallel: payload.parallel,
        });
        if (
          shouldSubmitCatalogCard({
            setIsCustom: payload.setIsCustom,
            parallelIsCustom: payload.parallelIsCustom,
            pickedFromCatalog: picked,
          })
        ) {
          void submitCatalogCardQuietly(card.id);
        }
      }
      if (!existing) {
        const draft = sharePostFromCard({
          isPublic: payload.isPublic,
          share: shareToFeed,
          caption,
          card: toPublicAttachment(card),
        });
        if (draft) {
          const posted = await createPost(draft);
          if (posted.error) {
            setSaveError("Saved the card, but couldn't share it to the feed.");
            setSaving(false);
            savingRef.current = false;
            return;
          }
          if (posted.postId) {
            const store = shareSessionStore();
            if (store) writeSharedPost(store, card.id, posted.postId);
          }
        }
      }
      router.push(`/cards/${card.id}`);
      onSaved?.();
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
      {embedded ? null : (
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
      )}

      <CategoryPicker value={category} onChange={setCategory} />

      {!existing ? (
        <>
          <CardSearch
            initialQuery={existing ? "" : initialQuery}
            onSelect={applyCatalog}
            onManual={applyManualSearch}
          />
          {sportOffer ? (
            <button
              type="button"
              onClick={() => {
                setForm((prev) => ({ ...prev, sport: sportOffer }));
                setSportOffer("");
              }}
              className="mt-2 text-left text-xs font-semibold text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
            >
              This card is listed as {mailDaySportLabel(sportOffer)}. Use that?
            </button>
          ) : null}
        </>
      ) : null}

      <CardPhotoField
        photo={photo}
        photoError={photoError}
        reading={readingPhoto}
        scanning={scanning}
        onTake={openCamera}
        onLibrary={openLibrary}
        onRemove={clearPhoto}
        onRetry={retryPhoto}
        cameraRef={cameraRef}
        libraryRef={libraryRef}
        onPick={(file) => void scanFile(file)}
      >
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
      </CardPhotoField>

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
            inputMode="text"
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
            options={optionsWithCurrent(SPORT_PICKER_OPTIONS, form.sport)}
            onChange={(sport) => {
              setSportTouched(true);
              setSportOffer("");
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
          options={optionsWithCurrent(sortSetNames(SETS), form.setBrand)}
          placeholder="Select a set"
          allowCustom
          customHint={SET_PARALLEL_HINT}
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
            placeholder="e.g. 136 or BCP-1"
            aria-label="Card number"
          />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <CheckHit>
            <input
              type="checkbox"
              checked={noNumber}
              onChange={(e) => {
                setNoNumber(e.target.checked);
                if (e.target.checked) {
                  setForm((prev) => ({ ...prev, cardNumber: "" }));
                }
              }}
              className="size-5 accent-violet-500"
            />
          </CheckHit>
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
            customHint={SET_PARALLEL_HINT}
            onChange={(parallel) => {
              const next = parallelChoice(form.setBrand, parallel);
              setParallelIsCustom(next.parallelIsCustom);
              setParallelNote("");
              setIsRookie((current) => current || textLooksRookie(next.parallel));
              setForm((prev) => ({
                ...prev,
                parallel: next.parallel,
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
              inputMode="numeric"
              min={1}
              step={1}
              value={form.serialRun}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, serialRun: e.target.value }))
              }
              className={inputClass}
              placeholder="e.g. 99"
              aria-label="Serial run"
            />
          </div>
        </Field>
      </div>

      <Field label="Serial number">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={form.serialNo}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, serialNo: e.target.value }))
          }
          className={inputClass}
          placeholder="e.g. 7"
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
              onBlur={() => markTouched("grade")}
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
                inputMode="numeric"
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
            suppressHydrationWarning
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
            inputMode="decimal"
            min={0}
            step="0.01"
            value={form.purchasePrice}
            onBlur={() => markTouched("purchasePrice")}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, purchasePrice: e.target.value }))
            }
            className={inputClass}
            placeholder="e.g. 25.00"
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
          inputMode="decimal"
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
          placeholder="e.g. 25.00"
        />
      </Field>

      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
        <CheckHit>
          <input
            type="checkbox"
            checked={sold}
            onChange={(e) => setSold(e.target.checked)}
            className="size-5 accent-violet-500"
          />
        </CheckHit>
        This card has been sold
      </label>

      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
        <label className="flex min-h-11 items-center gap-3">
          <CheckHit>
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => {
                setShare(e.target.checked);
                if (!e.target.checked) {
                  setOpenToOffers(false);
                  setShareToFeed(false);
                }
              }}
              className="size-5 accent-violet-500"
            />
          </CheckHit>
          Show this card on your public profile
        </label>
        <p className="text-xs leading-5 text-zinc-500">
          Cards are private by default. You can show them on your profile.
        </p>
      </div>

      <OpenToOffersToggle
        visible={showOpenToOffersToggle({
          isEdit: Boolean(existing),
          isOwner: true,
          isPublic: share,
          columnKnown: offersKnown,
        })}
        checked={openToOffers}
        onChange={setOpenToOffers}
      />

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
              inputMode="decimal"
              min={0}
              step="0.01"
              data-field="sellPrice"
              value={form.sellPrice}
              onBlur={() => markTouched("sellPrice")}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, sellPrice: e.target.value }))
              }
              className={inputClass}
              placeholder="e.g. 25.00"
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
        <span
          className={
            preview.placeholder
              ? "mt-1 block text-zinc-400 dark:text-zinc-500"
              : "mt-1 block font-medium"
          }
        >
          {preview.text}
        </span>
      </p>

      {existing ? null : (
        <ShareToFeedField
          isPublic={share}
          share={shareToFeed}
          caption={caption}
          onShare={setShareToFeed}
          onCaption={setCaption}
        />
      )}

      {saveError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-rose-600 dark:text-rose-400">{saveError}</p>
          <button
            type="submit"
            disabled={saving || readingPhoto}
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
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {existing ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-full border border-zinc-200 px-6 py-3 text-sm font-semibold text-zinc-700 dark:border-white/10 dark:text-zinc-200"
            >
              Cancel
            </button>
          ) : null}
        <button
          type="submit"
          disabled={saving || readingPhoto}
          onMouseDown={(e) => {
            // Keep focus so onBlur validation cannot swallow the first click.
            if (e.button === 0) e.preventDefault();
          }}
          className="rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-violet-500"
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
      </div>
    </form>
  );
}

function ShareToFeedField({
  isPublic,
  share,
  caption,
  onShare,
  onCaption,
}: {
  isPublic: boolean;
  share: boolean;
  caption: string;
  onShare: (value: boolean) => void;
  onCaption: (value: string) => void;
}) {
  const control = shareToFeedControl({ isPublic, share });
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
      <label className="flex min-h-11 items-center gap-3">
        <CheckHit>
          <input
            type="checkbox"
            checked={control.checked}
            disabled={control.disabled}
            onChange={(e) => onShare(e.target.checked)}
            className="size-5 accent-violet-500 disabled:opacity-40"
          />
        </CheckHit>
        Share to feed
      </label>
      {control.explanation ? (
        <p className="text-xs leading-5 text-zinc-500">{control.explanation}</p>
      ) : (
        <p className="text-xs leading-5 text-zinc-500">
          Off unless you turn it on. Adds a post with this card and its photo.
        </p>
      )}
      {control.checked ? (
        <textarea
          rows={3}
          value={caption}
          maxLength={POST_LIMIT}
          aria-label="Caption"
          onChange={(e) => onCaption(e.target.value)}
          className={`${inputClass} mt-3 resize-y`}
          placeholder="Add a caption"
        />
      ) : null}
    </div>
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
    <label className="inline-flex min-h-11 items-center gap-2 text-sm">
      <CheckHit>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="size-5 accent-violet-500"
        />
      </CheckHit>
      {label}
    </label>
  );
}

function CheckHit({ children }: { children: React.ReactNode }) {
  return <span className="grid size-11 shrink-0 place-items-center">{children}</span>;
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
