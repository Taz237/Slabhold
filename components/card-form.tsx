"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type SetStateAction } from "react";
import { ChevronDown, Loader2, ScanSearch } from "lucide-react";
import { AddCardFlow } from "@/components/add-card/add-card-flow";
import { Chip, DraftSlab, PrimaryButton, QuietButton, StepDock, focusRing } from "@/components/add-card/flow-ui";
import type { ArtCard } from "@/components/card-slab-art";
import {
  EditGroup,
  EditRow,
  EditSheet,
  FieldSheetRow,
  SheetRow,
  dateRowValue,
  moneyRowValue,
  serialRowValue,
  sheetFieldClass,
} from "@/components/edit-card/edit-parts";
import { CardPhotoField } from "@/components/card-photo-field";
import { CategoryPicker } from "@/components/category-picker";
import { useCollection, useDefaultAccent } from "@/components/collection-provider";
import { NativeSelect, SearchSelect, SET_PARALLEL_HINT } from "@/components/search-select";
import { useSocial } from "@/components/social-provider";
import { toPublicAttachment } from "@/lib/social/card-posts";
import { queueCardPost } from "@/lib/social/card-post-queue";
import {
  FEED_POST_LABEL,
  addCardMayPost,
  cardPostId,
  feedPostControl,
  justAddedCaption,
  recordCardPost,
  sharePostFromCard,
  shareSessionStore,
  shareToFeedControl,
  writeCardPostFailed,
  writeSharedPost,
} from "@/lib/social/share-to-feed";
import { isBrandAccount } from "@/lib/leaderboard/brand-accounts";
import { isOfficialUpdatesAccount } from "@/lib/social/official-updates";
import { isTestAccount } from "@/lib/test-accounts";
import { POST_LIMIT } from "@/lib/social/types";
import { CharacterRing } from "@/components/character-ring";
import { takeScan } from "@/lib/capture";
import { catalogLabel, type CatalogCard } from "@/lib/card-catalog";
import {
  CATALOG_MATCH_DEBOUNCE_MS,
  CATALOG_MISSING_NOTE,
  bestCatalogMatch,
  catalogMatchKey,
  catalogMatchQuery,
  catalogMatchView,
  matchForApply,
  type CatalogMatchLookup,
} from "@/lib/catalog/auto-match";
import { catalogPickFields } from "@/lib/catalog/catalog-pick";
import { loadCatalogSearchSession } from "@/lib/catalog/catalog-search-session";
import { searchCatalogRemote } from "@/lib/catalog/search-remote";
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
  isValidYear,
  normalizeCardNumberInput,
  optionsWithCurrent,
  sortSetNames,
  yearOptionsForSport,
} from "@/lib/card-options";
import {
  estimateInputFromCard,
  gradeNumberFromGrade,
  gradingCompanyChange,
  gradingCompanyFromCard,
  gradingCompanyOptions,
} from "@/lib/cards/grading-company";
import { ADD_FLOW_SUBLINE, type FlowPatch } from "@/lib/cards/add-flow";
import {
  ADD_FORM_SUBLINE,
  MORE_DETAILS_FIELDS,
  MORE_DETAILS_LABEL,
  addFormSections,
  draftOpensMoreDetails,
  firstInvalidField,
  revealField,
  type AddVisibleField,
  type MoreDetailsField,
} from "@/lib/cards/add-form-sections";
import { addedCardPath, type AddAnotherPrefill } from "@/lib/cards/added-panel";
import { browserStorage, lastUsedFromSave, readAddLastUsed, writeAddLastUsed } from "@/lib/cards/add-last-used";
import { captureSlabMorph } from "@/lib/cards/slab-morph";
import { preloadCardAddedPanel } from "@/components/card-page-parts";
import { haptic } from "@/lib/ios/haptics";
import { askForReview } from "@/lib/ios/review";
import {
  assessNewCardSubmit,
  clearNewCardDraft,
  formForSubmit,
  newCardSeed,
  purchaseForSubmit,
  readNewCardDraft,
  writeNewCardDraft,
  type CardDraftForm,
  type NewCardDraft,
} from "@/lib/cards/new-card-draft";
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
import { VisibilityChoice } from "@/components/visibility-choice";
import { cardCategory, categoryLabel } from "@/lib/card-category";
import { showOpenToOffersToggle } from "@/lib/offers/open-to-offers";
import {
  PRIVATE_VISIBILITY_HINT,
  readBrowserVisibilityChoice,
  subscribeVisibilityChoice,
  writeBrowserVisibilityChoice,
} from "@/lib/cards/visibility-choice";
import { parseManualPrefill } from "@/lib/card-search-query";
import { hasPaid } from "@/lib/format";
import { formatCardValueLabel, marketValueSummary } from "@/lib/value/format";
import { useCardValue } from "@/lib/value/use-card-values";
import {
  CARDS_LOADING_MESSAGE,
  claimSubmit,
  isSaveTimeout,
  SAVE_TIMEOUT_MESSAGE,
  SaveTimeoutError,
  saveFailureText,
} from "@/lib/save/attempt";
import { PHOTO_READ_ERROR, readPhotoFile } from "@/lib/photos";
import { pickNativePhoto, usesNativePicker } from "@/lib/ios/camera";
import type {
  CardCategory,
  IdentifyResult,
  SportsCard,
} from "@/lib/types";

/** Copy this card keeps the number in the draft key, so it never resumes an Add another draft. */
function prefillNumberKey(prefill: AddAnotherPrefill): string {
  if (prefill.noNumber) return "|nonumber";
  return prefill.number ? `|#${prefill.number}` : "";
}

const DEMO_IDENTIFY =
  process.env.NEXT_PUBLIC_ENABLE_DEMO_IDENTIFY === "true";

export function CardForm({
  existing,
  embedded = false,
  onCancel,
  onSaved,
  initialQuery = "",
  initialCatalog = null,
  guided = false,
  initialSport = "",
  initialPrefill = null,
}: {
  existing?: SportsCard;
  /** Inline on the card page: skip the extra title, keep the same save. */
  embedded?: boolean;
  onCancel?: () => void;
  onSaved?: () => void;
  /** Search text to prefill when Add card was opened from a miss. */
  initialQuery?: string;
  /** Catalog row chosen from Search. Same fields as picking it in Add card. */
  initialCatalog?: CatalogCard | null;
  /** Add card as the one-question-at-a-time picker. Edit ignores it. */
  guided?: boolean;
  /** Sport to start with, e.g. kept from "Add another". */
  initialSport?: string;
  /**
   * Player, year and set kept from "Add another" (opens on Card #), plus the
   * number from "Copy this card" (opens on Parallel or insert).
   */
  initialPrefill?: AddAnotherPrefill | null;
}) {
  const catalogStart = !existing && initialCatalog ? catalogPickFields(initialCatalog, "") : null;
  const guidedAdd = guided && !existing;
  const router = useRouter();
  const {
    addCard,
    updateCard,
    removeCard,
    cards,
    ready: cardsReady,
    loaded: cardsLoaded,
    loadFailed,
    syncError,
    reload: reloadCards,
  } = useCollection();
  const { mode, user, createPost } = useSocial();
  const userId = user?.id ?? null;
  // The last guided add's sport, year, set and grader, for the pre-selected answers.
  // Signed out on the server and on first paint, so it never differs at hydration.
  // Edit card never reads it.
  const lastUsed = useMemo(
    () => (guidedAdd ? readAddLastUsed(browserStorage(), userId) : null),
    [guidedAdd, userId],
  );
  const lastSport = lastUsed?.sport && SPORT_PICKER_OPTIONS.includes(lastUsed.sport) ? lastUsed.sport : null;
  const startSport = SPORT_PICKER_OPTIONS.includes(initialSport) ? initialSport : (lastSport ?? "Basketball");
  const prefill = !existing && !initialCatalog ? initialPrefill : null;
  const seed = existing
    ? null
    : newCardSeed(
        initialQuery,
        initialCatalog?.id ??
          (prefill
            ? `another:${prefill.player}|${prefill.year}|${prefill.set}${prefillNumberKey(prefill)}`
            : null),
      );
  const restored = seed ? readNewCardDraft(seed, userId) : null;
  const current = useCardValue(existing?.id ?? null);
  const currentValueLine = marketValueSummary(current.value);
  const accent = useDefaultAccent();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const photoSource = useRef<"camera" | "library">("library");
  const photoReadId = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  const [pendingCardId, setPendingCardId] = useState<string | null>(
    existing?.id ?? restored?.pendingId ?? null,
  );
  const pendingId = useRef<string | null>(existing?.id ?? restored?.pendingId ?? null);
  const [draftSealed, setDraftSealed] = useState(false);
  const [draftUserId, setDraftUserId] = useState(userId);
  const catalogPick = useRef<CatalogPickSnapshot | null>(catalogStart?.snapshot ?? null);
  const timedOutIds = useRef<Set<string>>(new Set());
  const [photo, setPhoto] = useState<string | null>(existing?.photoDataUrl ?? null);
  const [photoMissing, setPhotoMissing] = useState(Boolean(restored?.hadPhoto));
  const [showingRestored, setShowingRestored] = useState(restored != null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  // Add to collection rides above the keyboard outside the form, so it names its form.
  const guidedFormId = useId();
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) return;
    const scanned = takeScan();
    if (scanned) setPhoto(scanned);
  }, [existing]);

  const [sold, setSold] = useState(restored?.sold ?? Boolean(existing?.sellPrice));
  const rememberedShare = useSyncExternalStore(
    subscribeVisibilityChoice,
    () => (userId ? readBrowserVisibilityChoice(userId) : null),
    () => null,
  );
  const [shareChoice, setShareChoice] = useState<boolean | null>(
    restored?.share ?? (existing ? Boolean(existing.isPublic) : null),
  );
  const share = shareChoice ?? rememberedShare ?? false;
  const offersKnown = existing?.openToOffers != null;
  const [openToOffers, setOpenToOffers] = useState(
    restored?.openToOffers ?? existing?.openToOffers === true,
  );
  const [shareToFeedPick, setShareToFeed] = useState(restored?.shareToFeed ?? false);
  // Guided Add: until the collector touches "Also post to my feed", a public card starts with it on.
  const [feedTouched, setFeedTouched] = useState(restored != null);
  const shareToFeedChoice = guidedAdd && !feedTouched ? null : shareToFeedPick;
  const [captionText, setCaptionText] = useState(restored?.caption ?? "");
  // A typed or restored caption is never replaced by the prefilled one.
  const [captionTouched, setCaptionTouched] = useState(Boolean(restored?.caption));
  const mayPost = addCardMayPost({
    isBrand: isBrandAccount(user?.id),
    isOfficial: isOfficialUpdatesAccount(user?.id),
    isTest: isTestAccount(user?.username ?? ""),
  });
  const feedControl = guidedAdd
    ? feedPostControl({ isPublic: share, choice: shareToFeedChoice, mayPost })
    : null;
  const shareToFeed = feedControl ? feedControl.checked : Boolean(shareToFeedChoice);
  const postedFor = useRef<string | null>(null);
  const [category, setCategory] = useState<CardCategory>(
    restored?.category ?? (existing ? cardCategory(existing) : "pc"),
  );
  const [scanning, setScanning] = useState(false);
  const [identified, setIdentified] = useState<IdentifyResult | null>(null);

  const initialCompany = gradingCompanyFromCard({
    grade: existing?.grade ?? "",
    conditionType: existing?.conditionType,
  });

  const [gradeCompany, setGradeCompany] = useState(restored?.gradeCompany ?? initialCompany);
  const [gradeNumber, setGradeNumber] = useState(
    restored?.gradeNumber ?? gradeNumberFromGrade(existing?.grade ?? ""),
  );
  const [gradeQualifier, setGradeQualifier] = useState(
    restored?.gradeQualifier ?? existing?.gradeQualifier ?? "",
  );
  const [certNumber, setCertNumber] = useState(restored?.certNumber ?? existing?.certNumber ?? "");
  const [noNumber, setNoNumber] = useState(
    restored?.noNumber ?? (Boolean(existing?.noNumber) || Boolean(prefill?.noNumber)),
  );
  const prefillSetIsCustom = Boolean(
    prefill?.set && !SETS.some((name) => name.toLowerCase() === prefill.set.toLowerCase()),
  );
  const [setIsCustom, setSetIsCustom] = useState(
    restored?.setIsCustom ??
      (Boolean(existing?.setIsCustom) || Boolean(catalogStart?.setIsCustom) || prefillSetIsCustom),
  );
  const [parallelIsCustom, setParallelIsCustom] = useState(
    restored?.parallelIsCustom ??
      (Boolean(existing?.parallelIsCustom) || Boolean(catalogStart?.parallelIsCustom)),
  );
  const [parallelNote, setParallelNote] = useState("");
  const [sportOffer, setSportOffer] = useState(
    restored?.sportOffer ?? catalogStart?.sportOffer ?? "",
  );
  const [sportTouched, setSportTouched] = useState(restored?.sportTouched ?? Boolean(existing));
  const [isRookie, setIsRookie] = useState(
    restored?.isRookie ?? (Boolean(existing?.isRookie) || Boolean(catalogStart?.isRookie)),
  );
  const [isAuto, setIsAuto] = useState(restored?.isAuto ?? Boolean(existing?.isAuto));
  const [isRelic, setIsRelic] = useState(restored?.isRelic ?? Boolean(existing?.isRelic));
  const [unknownPurchase, setUnknownPurchase] = useState(restored?.unknownPurchase ?? false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const sections = addFormSections(Boolean(existing));
  const [moreOpen, setMoreOpen] = useState(() => draftOpensMoreDetails(restored));
  const [matchLookup, setMatchLookup] = useState<CatalogMatchLookup | null>(null);
  const [matchDismissed, setMatchDismissed] = useState(false);

  const manualPrefill =
    !existing && !catalogStart && initialQuery.trim() ? parseManualPrefill(initialQuery) : null;

  const defaultYear = existing
    ? existing.yearLabel || String(existing.year)
    : (catalogStart?.form.yearLabel || manualPrefill?.yearLabel || "");

  const blankForm: CardDraftForm = {
    playerName: catalogStart?.form.playerName ?? existing?.playerName ?? manualPrefill?.playerName ?? "",
    yearLabel: defaultYear,
    setBrand: existing?.setBrand ?? catalogStart?.form.setBrand ?? "",
    cardNumber: existing?.cardNumber ?? catalogStart?.form.cardNumber ?? manualPrefill?.cardNumber ?? "",
    parallel: existing?.parallel || catalogStart?.form.parallel || "Base",
    serialRun: existing?.serialRun != null ? String(existing.serialRun) : "",
    serialNo: existing?.serialNo != null ? String(existing.serialNo) : "",
    sport: existing?.sport ?? catalogStart?.form.sport ?? startSport,
    purchasePrice: hasPaid(existing) ? String(existing!.purchasePrice) : "",
    purchaseDate: existing ? (existing.purchaseDate ?? "") : "",
    estimatedSellPrice: estimateInputFromCard(existing?.estimatedSellPrice),
    sellPrice: existing?.sellPrice != null ? String(existing.sellPrice) : "",
    sellDate: existing?.sellDate ?? "",
    notes: existing?.notes ?? "",
  };
  // "Add another": same player, year and set. "Copy this card" adds the number.
  // Start over goes back to a blank search.
  const seededForm: CardDraftForm = prefill
    ? {
        ...blankForm,
        playerName: prefill.player,
        yearLabel: prefill.year,
        setBrand: prefill.set,
        cardNumber: prefill.number ?? "",
      }
    : blankForm;
  const [form, setFormState] = useState<CardDraftForm>(restored?.form ?? seededForm);
  const autoCaption = guidedAdd
    ? justAddedCaption({
        yearLabel: form.yearLabel,
        setBrand: form.setBrand,
        parallel: form.parallel,
        playerName: form.playerName,
      })
    : "";
  const caption = guidedAdd && !captionTouched ? autoCaption : captionText;
  // Over the limit with Share to feed on: hold the save rather than cut the caption.
  const captionOver =
    !existing && shareToFeedControl({ isPublic: share, share: shareToFeed }).checked && caption.length > POST_LIMIT;
  // Spread after `disabled` on each submit button so it wins over the saving/photo state.
  const holdSave = captionOver ? { disabled: true } : undefined;

  function setCaption(value: string) {
    setCaptionText(value);
    setCaptionTouched(true);
  }
  const liveForm = useRef(form);

  function setForm(action: SetStateAction<CardDraftForm>) {
    setFormState((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      liveForm.current = next;
      return next;
    });
  }

  function draftNow(formValues: CardDraftForm = liveForm.current): NewCardDraft | null {
    if (seed == null || draftSealed || draftUserId !== userId) return null;
    return {
      seed,
      userId,
      pendingId: pendingCardId,
      hadPhoto: Boolean(photo) || photoMissing,
      form: formValues,
      noNumber,
      setIsCustom,
      parallelIsCustom,
      gradeCompany,
      gradeNumber,
      gradeQualifier,
      certNumber,
      isRookie,
      isAuto,
      isRelic,
      sold,
      share,
      openToOffers,
      shareToFeed,
      caption,
      category,
      sportTouched,
      sportOffer,
      unknownPurchase,
    };
  }

  useEffect(() => {
    liveForm.current = form;
    if (seed == null || draftSealed || draftUserId !== userId) return;
    const untouched =
      !photo &&
      !photoMissing &&
      noNumber === Boolean(prefill?.noNumber) &&
      !sold &&
      share === (rememberedShare ?? false) &&
      !shareToFeedPick &&
      captionText.trim() === "" &&
      (form.parallel.trim() === "" || form.parallel === seededForm.parallel) &&
      !sportTouched &&
      !isRookie &&
      !isAuto &&
      !isRelic &&
      !unknownPurchase &&
      gradeNumber.trim() === "" &&
      certNumber.trim() === "" &&
      pendingCardId == null &&
      form.playerName.trim() === (prefill?.player ?? "") &&
      form.yearLabel.trim() === (prefill?.year ?? "") &&
      form.setBrand.trim() === (prefill?.set ?? "") &&
      form.cardNumber.trim() === (prefill?.number ?? "") &&
      form.notes.trim() === "" &&
      form.purchasePrice.trim() === "" &&
      form.purchaseDate.trim() === "" &&
      form.estimatedSellPrice.trim() === "" &&
      form.sellPrice.trim() === "";
    if (untouched) {
      clearNewCardDraft();
      return;
    }
    writeNewCardDraft({
      seed,
      userId,
      pendingId: pendingCardId,
      hadPhoto: Boolean(photo) || photoMissing,
      form,
      noNumber,
      setIsCustom,
      parallelIsCustom,
      gradeCompany,
      gradeNumber,
      gradeQualifier,
      certNumber,
      isRookie,
      isAuto,
      isRelic,
      sold,
      share,
      openToOffers,
      shareToFeed,
      caption,
      category,
      sportTouched,
      sportOffer,
      unknownPurchase,
    });
  }, [
    seed,
    userId,
    draftUserId,
    draftSealed,
    pendingCardId,
    photo,
    photoMissing,
    form,
    noNumber,
    setIsCustom,
    parallelIsCustom,
    gradeCompany,
    gradeNumber,
    gradeQualifier,
    certNumber,
    isRookie,
    isAuto,
    isRelic,
    sold,
    share,
    rememberedShare,
    openToOffers,
    shareToFeed,
    shareToFeedPick,
    caption,
    captionText,
    seededForm.parallel,
    prefill?.player,
    prefill?.year,
    prefill?.set,
    prefill?.number,
    prefill?.noNumber,
    category,
    sportTouched,
    sportOffer,
    unknownPurchase,
  ]);

  const view = assessNewCardSubmit({
    isEdit: Boolean(existing),
    form,
    noNumber,
    gradeCompany,
    gradeNumber,
    sold,
  });
  // Edit card's Save waits for a change: everything the save writes, as first shown.
  const editSignature = existing
    ? JSON.stringify([
        form,
        photo,
        noNumber,
        setIsCustom,
        parallelIsCustom,
        gradeCompany,
        gradeNumber,
        gradeQualifier,
        certNumber,
        isRookie,
        isAuto,
        isRelic,
        sold,
        share,
        openToOffers,
        category,
      ])
    : "";
  const [firstEditSignature] = useState(editSignature);
  const editDirty = editSignature !== firstEditSignature;
  const grading = view.grading;
  const conditionType = view.conditionType;
  const graded = view.graded;
  const gradeChoices = gradeSelectOptions(gradeCompany, gradeNumber);
  const yearOptions = yearOptionsForSport(form.sport);
  const parsedYear = view.parsedYear;
  const cardNumberOk = view.cardNumberOk;
  const setOk = view.setOk;
  const playerOk = view.playerOk;
  const yearOk = view.yearOk;
  const companyMissing = view.companyMissing;
  const purchaseNeg = view.purchaseNeg;
  const estNeg = view.estNeg;
  const sellNeg = view.sellNeg;

  const matchForm = useMemo(
    () =>
      existing || guidedAdd
        ? null
        : {
            playerName: form.playerName,
            yearLabel: form.yearLabel,
            setBrand: form.setBrand,
            cardNumber: form.cardNumber,
            noNumber,
          },
    [existing, guidedAdd, form.playerName, form.yearLabel, form.setBrand, form.cardNumber, noNumber],
  );
  const matchKey = matchForm ? catalogMatchKey(matchForm) : null;

  // One debounced catalog lookup for a typed card that was not picked from search.
  useEffect(() => {
    if (!matchForm || !matchKey) return;
    const query = catalogMatchQuery(matchForm);
    if (!query) return;
    const pick = catalogPick.current;
    const picked = catalogPickStillMatches(catalogPick.current, {
      playerName: matchForm.playerName,
      yearLabel: matchForm.yearLabel,
      setBrand: matchForm.setBrand,
      cardNumber: matchForm.noNumber ? "" : normalizeCardNumberInput(matchForm.cardNumber),
      // Parallel can differ from the catalog row.
      parallel: pick?.parallel ?? "Base",
    });
    if (picked) return;
    const session = loadCatalogSearchSession({
      query,
      search: searchCatalogRemote,
      debounceMs: CATALOG_MATCH_DEBOUNCE_MS,
      limit: 20,
    });
    void session.done.then((snapshot) => {
      if (snapshot.aborted) return;
      setMatchLookup({ query: matchKey, match: bestCatalogMatch(matchForm, snapshot.results) });
    });
    return () => session.abort();
  }, [matchForm, matchKey]);

  function markTouched(key: string) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function focusFirstInvalid(
    check: ReturnType<typeof assessNewCardSubmit>,
    values: CardDraftForm,
  ) {
    const key = firstInvalidField(check, values);
    if (!key || !formRef.current) return;
    const el = revealField(formRef.current, key);
    if (el?.closest("details")) setMoreOpen(true);
  }

  /** The iOS app's own camera and photo picker, instead of a file input. */
  function pickInApp(picking: Promise<File | null>) {
    setPhotoError(null);
    picking
      .then((file) => {
        if (file) void scanFile(file);
      })
      .catch((error: unknown) => setPhotoError(error instanceof Error ? error.message : PHOTO_READ_ERROR));
  }

  function openCamera() {
    photoSource.current = "camera";
    if (usesNativePicker()) return pickInApp(pickNativePhoto("camera"));
    cameraRef.current?.click();
  }

  function openLibrary() {
    photoSource.current = "library";
    if (usesNativePicker()) return pickInApp(pickNativePhoto("library"));
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
    setPhotoMissing(false);
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
    const picked = catalogPickFields(card, sportTouched ? form.sport : "");
    const sport = sportAfterCatalogPick(sportTouched ? form.sport : "", card.sport);
    setSportOffer(sport.offer);
    catalogPick.current = picked.snapshot;
    setForm((prev) => ({
      ...prev,
      ...picked.form,
      sport: sport.sport,
    }));
    setIsRookie((current) => rookieAfterCatalogPick(current, card));
    setSetIsCustom(picked.setIsCustom);
    setParallelIsCustom(picked.parallelIsCustom);
    setParallelNote("");
    setIdentified(null);
    setMatchLookup(null);
  }

  /** "Use this" on the match chip. Grade and parallel stay as typed. */
  function acceptMatch(match: CatalogCard) {
    applyCatalog(matchForApply(match, form.parallel));
  }

  /** One answer from the guided picker, written into the same state the form saves. */
  function applyFlowPatch(patch: FlowPatch) {
    const formPatch = patch.form;
    if (formPatch) {
      setForm((prev) => ({ ...prev, ...formPatch }));
      if (formPatch.parallel) {
        const parallel = formPatch.parallel;
        setIsRookie((current) => current || textLooksRookie(parallel));
      }
    }
    if (patch.noNumber !== undefined) setNoNumber(patch.noNumber);
    if (patch.setIsCustom !== undefined) setSetIsCustom(patch.setIsCustom);
    if (patch.parallelIsCustom !== undefined) {
      setParallelIsCustom(patch.parallelIsCustom);
      setParallelNote("");
    }
    if (patch.isAuto !== undefined) setIsAuto(patch.isAuto);
    if (patch.gradeCompany !== undefined) chooseGradeCompany(patch.gradeCompany);
    if (patch.gradeNumber !== undefined) setGradeNumber(patch.gradeNumber);
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

  function chooseVisibility(next: boolean) {
    setShareChoice(next);
    if (!next) {
      setOpenToOffers(false);
      setShareToFeed(false);
    }
    // Guided Add: public turns "Also post to my feed" on (they can turn it off); private locks it off.
    if (guidedAdd) setFeedTouched(false);
  }

  function chooseFeedPost(next: boolean) {
    setShareToFeed(next);
    setFeedTouched(true);
  }

  function startOver() {
    setDraftSealed(false);
    setPendingCardId(null);
    clearNewCardDraft();
    setShowingRestored(false);
    setPhotoMissing(false);
    setPhoto(null);
    setPhotoError(null);
    setIdentified(null);
    setSold(false);
    setShareChoice(null);
    setOpenToOffers(false);
    setShareToFeed(false);
    setFeedTouched(false);
    setCaptionText("");
    setCaptionTouched(false);
    setCategory("pc");
    setGradeCompany(initialCompany);
    setGradeNumber("");
    setGradeQualifier("");
    setCertNumber("");
    setNoNumber(false);
    setSetIsCustom(Boolean(catalogStart?.setIsCustom));
    setParallelIsCustom(Boolean(catalogStart?.parallelIsCustom));
    setParallelNote("");
    setSportOffer(catalogStart?.sportOffer ?? "");
    setSportTouched(false);
    setIsRookie(Boolean(catalogStart?.isRookie));
    setIsAuto(false);
    setIsRelic(false);
    setUnknownPurchase(false);
    setMoreOpen(false);
    setMatchLookup(null);
    setMatchDismissed(false);
    setTouched({});
    setSaveError(null);
    // "Start a different card" after Add another clears the kept player, year and set too.
    setForm(blankForm);
  }

  if (draftUserId !== userId) {
    setDraftUserId(userId);
    clearNewCardDraft();
    setDraftSealed(false);
    setPendingCardId(null);
    if (seed != null) startOver();
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    void submit();
  }

  async function submit() {
    if (captionOver) return;
    if (!claimSubmit(savingRef)) return;
    const values = formForSubmit(form, liveForm.current);
    const check = assessNewCardSubmit({
      isEdit: Boolean(existing),
      form: values,
      noNumber,
      gradeCompany,
      gradeNumber,
      sold,
    });
    if (values !== form) setForm(values);
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
    if (!check.ok || !check.parsedYear) {
      savingRef.current = false;
      const next = draftNow(values);
      if (next) writeNewCardDraft(next);
      requestAnimationFrame(() => focusFirstInvalid(check, values));
      return;
    }

    const grade = check.grading.grade;
    const parallel = parallelChoice(values.setBrand, values.parallel);
    const parsed = check.parsedYear;
    const liveCondition = check.conditionType;

    const payload = {
      playerName: values.playerName.trim(),
      year: parsed.year,
      yearLabel: parsed.yearLabel,
      setBrand: values.setBrand.trim(),
      setIsCustom,
      cardNumber: noNumber
        ? ""
        : normalizeCardNumberInput(values.cardNumber),
      noNumber,
      grade,
      parallel: parallel.parallel,
      parallelIsCustom: parallel.parallelIsCustom,
      serialRun: values.serialRun ? Number(values.serialRun) : null,
      serialNo: values.serialNo ? Number(values.serialNo) : null,
      isRookie,
      isAuto,
      isRelic,
      conditionType: liveCondition,
      gradeQualifier: liveCondition === "graded" ? gradeQualifier : "",
      certNumber: liveCondition === "graded" ? certNumber.trim() : "",
      sport: values.sport,
      ...purchaseForSubmit({
        unknownPurchase,
        purchasePrice: values.purchasePrice,
        purchaseDate: values.purchaseDate,
      }),
      estimatedSellPrice: Number(values.estimatedSellPrice) || 0,
      sellPrice: sold && values.sellPrice ? Number(values.sellPrice) : null,
      sellDate: sold && values.sellDate ? values.sellDate : null,
      notes: values.notes.trim(),
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
    // A restored pending id is only "missing" once this account's cards have loaded.
    let knownCards = cards;
    let collectionKnown = cardsLoaded && !loadFailed;
    const pendingInMemory =
      pendingCardId != null && cards.some((item) => item.id === pendingCardId);
    if (!existing && pendingCardId && !collectionKnown && !pendingInMemory) {
      // A load that failed won't come back on its own: Retry asks for the cards again.
      const fresh = loadFailed ? await reloadCards() : null;
      if (!fresh) {
        setSaveError(CARDS_LOADING_MESSAGE);
        setSaving(false);
        savingRef.current = false;
        return;
      }
      knownCards = fresh;
      collectionKnown = true;
    }
    try {
      const targetId = existing?.id ?? pendingCardId;
      const inMemory =
        targetId != null && knownCards.some((item) => item.id === targetId);
      const updating = Boolean(targetId && (existing || inMemory));
      let result = updating
        ? updateCard(targetId as string, payload)
        : addCard(
            !existing && pendingCardId ? { ...payload, id: pendingCardId } : payload,
          );
      if (!existing) {
        pendingId.current = result.card.id;
        setPendingCardId(result.card.id);
        if (!updating) createdId = result.card.id;
      }
      const saved = result.saved.then(
        () => undefined,
        async (error: unknown) => {
          const missingCard = error instanceof Error && error.message === "Card not found.";
          if (!(missingCard && !existing && pendingCardId && collectionKnown)) throw error;
          result = addCard({ ...payload, id: pendingCardId });
          pendingId.current = result.card.id;
          setPendingCardId(result.card.id);
          createdId = result.card.id;
          await result.saved;
        },
      );
      // The card page opens with the "Added" panel: fetch it while the save runs.
      if (!existing) preloadCardAddedPanel();
      await saved;
      const { card } = result;
      // Set once this add's post is on the feed: the haptic says "post", not "save".
      let postedNow = false;
      // The regular form's post failed: the card still saved, so the haptic says "save".
      let postFailedText: string | null = null;
      createdId = null;
      // A happy moment: a new card makes 3 or more. Only the iPhone app may ask.
      if (!existing && knownCards.filter((item) => item.id !== card.id).length + 1 >= 3) askForReview("third-card");
      if (seed != null) {
        setDraftSealed(true);
        pendingId.current = card.id;
        setPendingCardId(card.id);
        clearNewCardDraft();
        if (user?.id) writeBrowserVisibilityChoice(user.id, payload.isPublic);
      }
      if (offerPrivacy && user) rememberFirstCardPrivacy(user.id, card.id);
      // Only a saved guided add is remembered; Edit card never writes it.
      if (guidedAdd && user?.id) {
        writeAddLastUsed(
          browserStorage(),
          user.id,
          lastUsedFromSave({
            sport: payload.sport,
            yearLabel: payload.yearLabel,
            setBrand: payload.setBrand,
            gradeCompany,
            conditionType: liveCondition,
          }),
        );
      }
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
      if (!existing && (mayPost || !guidedAdd)) {
        const draft = sharePostFromCard({
          isPublic: payload.isPublic,
          share: shareToFeed,
          caption,
          card: toPublicAttachment(card),
        });
        const store = shareSessionStore();
        // One add makes one post at most: a retry after a post that went up never posts again.
        const already = postedFor.current === card.id ? "posted" : store ? cardPostId(store, card.id) : null;
        const postNow = async (post: NonNullable<typeof draft>) => {
          const posted = await createPost(post);
          if (posted.error) {
            // The card is saved. The reveal says the post failed and offers Post it.
            if (guidedAdd && store) writeCardPostFailed(store, card.id, post.body);
            return { postId: null, error: posted.error };
          }
          postedFor.current = card.id;
          if (posted.postId && store) {
            writeSharedPost(store, card.id, posted.postId);
            recordCardPost(store, card.id, posted.postId);
          }
          return { postId: posted.postId ?? null, error: null };
        };
        if (draft && already) {
          postedNow = true;
          if (store && already !== "posted") writeSharedPost(store, card.id, already);
        } else if (draft && guidedAdd) {
          // Saved is the moment: the reveal opens now and the post lands behind it.
          // The reveal waits on this post (lib/social/card-post-queue.ts), not the Add button.
          // Not up yet, so the haptic says "save".
          void queueCardPost(card.id, () => postNow(draft));
        } else if (draft) {
          const posted = await postNow(draft);
          if (posted.error) postFailedText = "Saved the card, but couldn't share it to the feed.";
          else postedNow = true;
        }
      }
      // The reveal glides its slab in from where the Review slab sits now. Recorded, never awaited.
      if (guidedAdd) captureSlabMorph();
      if (!existing) haptic(postedNow ? "post" : "save");
      if (postFailedText) {
        setSaveError(postFailedText);
        setSaving(false);
        savingRef.current = false;
        return;
      }
      router.push(existing ? `/cards/${card.id}` : addedCardPath(card.id));
      onSaved?.();
    } catch (error) {
      if (isSaveTimeout(error)) {
        if (createdId) {
          timedOutIds.current.add(createdId);
          pendingId.current = createdId;
          setPendingCardId(createdId);
        }
        if (seed != null) {
          setDraftSealed(true);
          clearNewCardDraft();
        }
        if (error instanceof SaveTimeoutError && error.photoUrl) setPhoto(error.photoUrl);
        setSaveError(SAVE_TIMEOUT_MESSAGE);
        setSaving(false);
        savingRef.current = false;
        return;
      }
      const timedOut = createdId != null && timedOutIds.current.has(createdId);
      if (createdId && !timedOut) removeCard(createdId);
      if (createdId && !timedOut) {
        pendingId.current = null;
        setPendingCardId(null);
      }
      setSaveError(saveFailureText(error));
      setSaving(false);
      savingRef.current = false;
    }
  }

  const headerNode = embedded ? null : (
      <div>
        <p
          className={
            existing
              ? "text-[13px] text-zinc-500"
              : "text-sm font-medium text-zinc-500"
          }
        >
          {existing ? "Update position" : "Add a card"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {existing ? `Edit ${existing.playerName}` : "Add a card"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {existing
            ? "Player, set, what you paid, and a photo."
            : guidedAdd
              ? ADD_FLOW_SUBLINE
              : ADD_FORM_SUBLINE}{" "}
          {mode === "supabase"
            ? "Saved to your account."
            : "Saved in this browser."}
        </p>
      </div>
  );

  const categoryNode = <CategoryPicker value={category} onChange={setCategory} />;

  const sportOfferNode = sportOffer ? (
        <button
          type="button"
          onClick={() => {
            setForm((prev) => ({ ...prev, sport: sportOffer }));
            setSportOffer("");
          }}
          className="min-h-11 text-left text-xs font-semibold text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
        >
          This card is listed as {mailDaySportLabel(sportOffer)}. Use that?
        </button>
  ) : null;

  const startOverNode = showingRestored ? (
        <button
          type="button"
          onClick={startOver}
          className="text-sm font-semibold text-violet-700 underline decoration-violet-700/40 underline-offset-2 dark:text-violet-300"
        >
          Start over
        </button>
  ) : null;

  const photoNode = (
    <>
      {photoMissing && !photo ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">Photo needs re-adding</p>
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
                    <p className="text-[13px] text-violet-700 dark:text-violet-300">
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
    </>
  );

  const playerNode = (
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
  );

  const yearNode = (
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
  );

  const sportNode = (
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
  );

  const setNode = (
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
  );

  const cardNumberNode = (
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
  );

  const parallelNode = (
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
  );

  const serialRunNode = (
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
  );

  const serialNoNode = (
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
  );

  const traitsNode = (
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
  );

  const gradingCompanyNode = (
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
  );

  const gradeNode = graded ? (
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
  ) : null;

  const gradeExtrasNode = graded ? (
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
  ) : null;

  const gradeQualifierNode = graded ? (
    <Field label="Qualifier">
      <NativeSelect
        label="Qualifier"
        value={gradeQualifier}
        options={GRADE_QUALIFIERS}
        placeholder="None"
        onChange={setGradeQualifier}
      />
    </Field>
  ) : null;

  const purchaseNode = (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Purchase date">
          <input
            type="date"
            data-field="purchaseDate"
            suppressHydrationWarning
            value={form.purchaseDate}
            disabled={unknownPurchase}
            onBlur={() => markTouched("purchaseDate")}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, purchaseDate: e.target.value }))
            }
            className={`${inputClass} disabled:opacity-50`}
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
            data-field="purchasePrice"
            value={form.purchasePrice}
            disabled={unknownPurchase}
            onBlur={() => markTouched("purchasePrice")}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, purchasePrice: e.target.value }))
            }
            className={`${inputClass} disabled:opacity-50`}
            placeholder="e.g. 25.00"
          />
        </Field>
      </div>
      {existing ? null : (
        <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <CheckHit>
            <input
              type="checkbox"
              checked={unknownPurchase}
              onChange={(e) => {
                setUnknownPurchase(e.target.checked);
                if (e.target.checked) {
                  setForm((prev) => ({ ...prev, purchasePrice: "", purchaseDate: "" }));
                }
              }}
              className="size-5 accent-violet-500"
            />
          </CheckHit>
          Don’t know (bin card)
        </label>
      )}
    </div>
  );

  const estimateNode = (
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
          data-field="estimatedSellPrice"
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
  );

  const soldToggleNode = (
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
  );

  const visibilityNode = (
      <VisibilityChoice
        isPublic={share}
        onChange={chooseVisibility}
        hint={share ? "" : PRIVATE_VISIBILITY_HINT}
      />
  );

  const offersNode = (
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
  );

  const sellFieldsNode = sold ? (
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
  ) : null;

  const notesNode = (
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
  );

  const shareToFeedNode = existing ? null : (
        <ShareToFeedField
          isPublic={share}
          share={shareToFeed}
          caption={caption}
          onShare={setShareToFeed}
          onCaption={setCaption}
        />
  );

  const saveErrorNode = saveError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-rose-600 dark:text-rose-400">{saveError}</p>
          <button
            type="submit"
            disabled={saving || readingPhoto}
            {...holdSave}
            className="inline-flex h-11 items-center justify-center rounded-full border border-rose-300 px-4 text-sm font-semibold text-rose-700 disabled:opacity-40 dark:border-rose-400/40 dark:text-rose-300"
          >
            Retry
          </button>
        </div>
  ) : null;

  if (guidedAdd) {
    const guidedMoreNodes: Record<MoreDetailsField, React.ReactNode> = {
      sport: sportNode,
      serialRun: null,
      serialNo: null,
      traits: traitsNode,
      // The cert number is on Review's Condition row; the qualifier stays here.
      gradeExtras: gradeQualifierNode,
      purchase: purchaseNode,
      estimatedSellPrice: estimateNode,
      sold: (
        <>
          {soldToggleNode}
          {sellFieldsNode}
        </>
      ),
      openToOffers: offersNode,
      notes: notesNode,
      // On Review instead, next to Public / Private.
      shareToFeed: null,
      category: categoryNode,
    };
    const feedPostNode = feedControl ? (
      <FeedPostField
        control={feedControl}
        caption={caption}
        onShare={chooseFeedPost}
        onCaption={setCaption}
      />
    ) : null;
    // Serial run and number are their own step in the picker.
    const guidedMore = MORE_DETAILS_FIELDS.filter((key) => key !== "serialRun" && key !== "serialNo");
    return (
      <form id={guidedFormId} ref={formRef} onSubmit={onSubmit} className="mx-auto max-w-xl">
        <AddCardFlow
          formId={guidedFormId}
          form={form}
          noNumber={noNumber}
          parallelIsCustom={parallelIsCustom}
          isAuto={isAuto}
          gradeCompany={gradeCompany}
          gradeNumber={gradeNumber}
          gradeQualifier={gradeQualifier}
          certNumber={certNumber}
          photo={photo}
          accent={accent}
          saving={saving}
          // The flow only uses this to disable Add to collection, so an over-long shared caption holds it too.
          readingPhoto={readingPhoto || captionOver}
          resumed={showingRestored}
          prefilled={Boolean(prefill)}
          positionKey={seed != null ? `${userId ?? ""}\n${seed}` : null}
          lastUsed={lastUsed}
          apply={applyFlowPatch}
          onCertNumber={setCertNumber}
          pickCatalog={applyCatalog}
          onStartOver={startOver}
          header={headerNode}
          photoBlock={
            // Photo buttons stay the first controls; who can see the card sits right under them.
            <div className="space-y-5">
              {photoNode}
              {visibilityNode}
            </div>
          }
          moreDetails={guidedMore.map((key) => (
            <Fragment key={key}>{guidedMoreNodes[key]}</Fragment>
          ))}
          moreOpen={moreOpen}
          onMoreOpen={setMoreOpen}
          sportOffer={sportOfferNode}
          saveError={saveErrorNode}
          feedPost={feedPostNode}
        />
      </form>
    );
  }

  if (sections) {
    const matchView = catalogMatchView({
      query: matchKey,
      dismissed: matchDismissed,
      lookup: matchLookup,
    });
    const match = matchView === "chip" ? (matchLookup?.match ?? null) : null;
    const matchNode = match ? (
      <div
        role="status"
        className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-3"
      >
        <p className="text-sm text-zinc-700 dark:text-zinc-200">
          Is this your card?{" "}
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">
            {catalogLabel(matchForApply(match, form.parallel))}
          </span>
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => acceptMatch(match)}
            className="inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500"
          >
            Use this
          </button>
          <button
            type="button"
            onClick={() => setMatchDismissed(true)}
            aria-label="No, that's not my card"
            className="inline-flex min-h-11 items-center rounded-full border border-zinc-200 px-5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
          >
            No
          </button>
        </div>
      </div>
    ) : matchView === "missing" ? (
      <p className="text-xs leading-5 text-zinc-500">{CATALOG_MISSING_NOTE}</p>
    ) : null;

    const moreNodes: Record<MoreDetailsField, React.ReactNode> = {
      sport: sportNode,
      serialRun: serialRunNode,
      serialNo: serialNoNode,
      traits: traitsNode,
      gradeExtras: gradeExtrasNode,
      purchase: purchaseNode,
      estimatedSellPrice: estimateNode,
      sold: (
        <>
          {soldToggleNode}
          {sellFieldsNode}
        </>
      ),
      openToOffers: offersNode,
      notes: notesNode,
      shareToFeed: shareToFeedNode,
      category: categoryNode,
    };

    const visibleNodes: Record<AddVisibleField, React.ReactNode> = {
      photo: photoNode,
      playerName: playerNode,
      yearLabel: yearNode,
      setBrand: setNode,
      cardNumber: cardNumberNode,
      parallel: parallelNode,
      gradingCompany: gradingCompanyNode,
      grade: gradeNode,
      submit: (
        <>
          {matchNode}
          {sportOfferNode}
          <details
            open={moreOpen}
            onToggle={(e) => setMoreOpen(e.currentTarget.open)}
            className="group rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.03]"
          >
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{MORE_DETAILS_LABEL}</span>
                <span className="block text-xs text-zinc-500">
                  What you paid, notes, sharing
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className="size-4 shrink-0 text-zinc-500 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <div className="space-y-5 border-t border-zinc-200 px-4 pt-4 pb-5 dark:border-white/10">
              {sections.more.map((key) => (
                <Fragment key={key}>{moreNodes[key]}</Fragment>
              ))}
            </div>
          </details>
          {saveErrorNode}
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 -mx-4 bg-[color-mix(in_oklab,var(--background)_96%,transparent)] px-4 py-3 backdrop-blur-xl sm:mx-0 sm:px-0">
            <button
              type="submit"
              disabled={saving || readingPhoto}
              {...holdSave}
              onMouseDown={(e) => {
                // Keep focus so onBlur validation cannot swallow the first click.
                if (e.button === 0) e.preventDefault();
              }}
              className="min-h-12 w-full rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-violet-500"
            >
              {saving ? "Adding…" : "Add to collection"}
            </button>
          </div>
        </>
      ),
    };

    return (
      <form ref={formRef} onSubmit={onSubmit} className="mx-auto max-w-xl space-y-5">
        {headerNode}
        {startOverNode}
        {sections.visible.map((key) => (
          <Fragment key={key}>
            {visibleNodes[key]}
            {/* Who can see the card sits right under the photo buttons. */}
            {key === "photo" ? visibilityNode : null}
          </Fragment>
        ))}
      </form>
    );
  }

  // Edit card: the slab on top, then grouped rows that each open a sheet.
  // Same state, checks and submit() as before; only the presentation differs.
  const editFormId = guidedFormId;
  const rowError = (key: string, failing: boolean, text: string) => (touched[key] && failing ? text : null);
  const yearRowError = rowError(
    "yearLabel",
    !yearOk,
    form.yearLabel.trim() === "" ? "Year is required" : "Use 2026 or 2023-24",
  );
  const sellMissing = sold && !form.sellPrice.trim();
  const serialShown = serialRowValue(form.serialNo, form.serialRun);
  const graderShown = graded ? gradeCompany : gradeCompany ? "Raw" : "";
  const hasNotes = form.notes.trim() !== "";
  const showMore = moreOpen;
  const playerChoices = optionsWithCurrent(
    [...new Set(cards.map((item) => item.playerName.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    form.playerName.trim(),
  );
  const soldShown = sold
    ? ["Sold", moneyRowValue(form.sellPrice), form.sellDate ? dateRowValue(form.sellDate) : ""].filter(Boolean).join(" · ")
    : "";
  const heroArt: ArtCard = {
    playerName: form.playerName.trim() || existing?.playerName || "Your card",
    year: parsedYear?.year ?? existing?.year ?? 0,
    yearLabel: parsedYear?.yearLabel ?? existing?.yearLabel ?? "",
    setBrand: form.setBrand.trim(),
    grade: grading.grade,
    conditionType,
    grader: graded ? gradeCompany : undefined,
    gradeQualifier: graded ? gradeQualifier : "",
    certNumber: graded ? certNumber : "",
    accent: existing?.accent ?? accent,
  };
  const heroLine = [heroArt.yearLabel || (heroArt.year ? String(heroArt.year) : ""), heroArt.setBrand]
    .filter(Boolean)
    .join(" · ");
  const heroGrade = graded ? [grading.grade, gradeQualifier].filter(Boolean).join(" ") : "Raw";
  const pickerRow =
    (label: string, display: string, opts: { error?: string | null; dataField?: string; placeholder?: string } = {}) =>
    // eslint-disable-next-line react/display-name
    ({ open, expanded }: { open: () => void; expanded: boolean }) => (
      <EditRow
        label={label}
        value={display}
        placeholder={opts.placeholder ?? "Choose"}
        error={opts.error}
        dataField={opts.dataField}
        expanded={expanded}
        onClick={open}
      />
    );

  const serialRows = (
    <SheetRow label="Serial" value={serialShown} placeholder="Not numbered" dataField="serialRun">
      {() => (
        <SerialFields
          serialNo={form.serialNo}
          serialRun={form.serialRun}
          onSerialNo={(serialNo) => setForm((prev) => ({ ...prev, serialNo }))}
          onSerialRun={(serialRun) => setForm((prev) => ({ ...prev, serialRun }))}
        />
      )}
    </SheetRow>
  );
  const certRow = graded ? (
    <FieldSheetRow
      label="Cert #"
      value={certNumber}
      placeholder="Add"
      inputMode="numeric"
      inputPlaceholder="From the label"
      dataField="certNumber"
      onChange={setCertNumber}
    />
  ) : null;
  const qualifierRow = graded ? (
    <SearchSelect
      label="Qualifier"
      value={gradeQualifier}
      options={GRADE_QUALIFIERS}
      allowEmpty
      searchable={false}
      onChange={setGradeQualifier}
      renderTrigger={pickerRow("Qualifier", gradeQualifier, { placeholder: "None" })}
    />
  ) : null;
  const notesRow = (
    <SheetRow label="Notes" value={form.notes.trim()} placeholder="Add">
      {() => (
        <NotesField
          value={form.notes}
          onChange={(notes) => setForm((prev) => ({ ...prev, notes }))}
        />
      )}
    </SheetRow>
  );

  return (
    <form
      id={editFormId}
      ref={formRef}
      onSubmit={onSubmit}
      // Room under the last row for the tab bar and the home indicator.
      className="mx-auto max-w-xl space-y-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
      data-slot="edit-card"
      aria-busy={saving || undefined}
    >
      <div className="grid min-h-11 grid-cols-[1fr_auto_1fr] items-center gap-3">
        <QuietButton onClick={cancelEdit} className="-ml-3 justify-self-start text-zinc-700 dark:text-zinc-200">
          Cancel
        </QuietButton>
        <h1 className="text-base font-semibold">Edit card</h1>
        <span aria-hidden />
      </div>

      {embedded ? null : (
        <div className="flex flex-col items-center text-center">
          <div className="w-36 sm:w-40">
            <DraftSlab art={heroArt} photo={photo} />
          </div>
          <p className="mt-4 max-w-full truncate text-xl font-semibold tracking-tight">{heroArt.playerName}</p>
          <p className="mt-1 text-sm text-zinc-500 tabular-nums">
            {[heroLine, heroGrade].filter(Boolean).join(" · ")}
          </p>
          <SheetRowButton label={photo ? "Change photo" : "Add a photo"} title="Photo">
            {() => <div className="space-y-3">{photoNode}</div>}
          </SheetRowButton>
        </div>
      )}

      {/* Read-only: recent sold prices for this card, next to the card itself. */}
      <EditGroup>
        <EditRow
          label="Current value"
          chevron={false}
          value={
            current.loading
              ? "Checking…"
              : (currentValueLine?.replace(/^Current value /, "") ??
                formatCardValueLabel(current.value, { createdAt: existing?.createdAt ?? "" }))
          }
          placeholder="No sales yet"
        />
      </EditGroup>

      <EditGroup title="Card">
        <SearchSelect
          label="Player"
          value={form.playerName}
          options={playerChoices}
          allowCustom
          searchPlaceholder="Search or type a player"
          dataField="playerName"
          onChange={(playerName) => {
            markTouched("playerName");
            setForm((prev) => ({ ...prev, playerName }));
          }}
          renderTrigger={pickerRow("Player", form.playerName, {
            error: rowError("playerName", !playerOk, "Player name is required"),
            dataField: "playerName",
          })}
        />
        <SearchSelect
          label="Year"
          value={form.yearLabel}
          options={
            form.yearLabel && isValidYear(form.yearLabel)
              ? optionsWithCurrent(yearOptions, form.yearLabel)
              : yearOptions
          }
          allowCustom
          isCustomValid={isValidYear}
          customInvalidHint="Use 2026 or 2023-24"
          inputMode="text"
          onChange={(yearLabel) => {
            markTouched("yearLabel");
            setForm((prev) => ({ ...prev, yearLabel }));
          }}
          renderTrigger={pickerRow("Year", form.yearLabel, { error: yearRowError, dataField: "yearLabel" })}
        />
        <SearchSelect
          label="Set"
          value={form.setBrand}
          options={optionsWithCurrent(sortSetNames(SETS), form.setBrand)}
          allowCustom
          customHint={SET_PARALLEL_HINT}
          searchPlaceholder="Search or type a set"
          onChange={(setBrand) => {
            markTouched("setBrand");
            const known = SETS.some((s) => s.toLowerCase() === setBrand.toLowerCase());
            setSetIsCustom(Boolean(setBrand) && !known);
            const next = parallelAfterSetChange({ parallel: form.parallel, parallelIsCustom, setBrand });
            setParallelIsCustom(next.parallelIsCustom);
            setParallelNote(next.reset ? "Parallel reset for this set" : "");
            setForm((prev) => ({ ...prev, setBrand, parallel: next.parallel }));
          }}
          renderTrigger={pickerRow("Set", form.setBrand, {
            error: rowError("setBrand", !setOk, "Set is required"),
            dataField: "setBrand",
          })}
        />
        <FieldSheetRow
          label="Card #"
          value={form.cardNumber}
          display={noNumber ? "No number" : form.cardNumber ? `#${form.cardNumber}` : ""}
          prefix="#"
          inputPlaceholder="136 or BCP-1"
          dataField="cardNumber"
          error={rowError("cardNumber", !noNumber && !cardNumberOk, "Add a number or No number")}
          onChange={(value) => {
            markTouched("cardNumber");
            if (noNumber && value) setNoNumber(false);
            setForm((prev) => ({ ...prev, cardNumber: value.replace(/^#/, "") }));
          }}
          extra={
            <Chip
              selected={noNumber}
              onClick={() => {
                const next = !noNumber;
                setNoNumber(next);
                if (next) setForm((prev) => ({ ...prev, cardNumber: "" }));
              }}
            >
              No number on card
            </Chip>
          }
        />
        <SearchSelect
          label="Parallel"
          value={form.parallel}
          options={optionsWithCurrent([...parallelsForSet(form.setBrand)], form.parallel)}
          allowCustom
          customHint={SET_PARALLEL_HINT}
          searchPlaceholder="Search or type a parallel"
          onChange={(parallel) => {
            const next = parallelChoice(form.setBrand, parallel);
            setParallelIsCustom(next.parallelIsCustom);
            setParallelNote("");
            setIsRookie((current) => current || textLooksRookie(next.parallel));
            setForm((prev) => ({ ...prev, parallel: next.parallel }));
          }}
          renderTrigger={pickerRow("Parallel", parallelNote ? `${form.parallel || "Base"} (reset)` : form.parallel || "Base")}
        />
        {serialShown || showMore ? serialRows : null}
        <SearchSelect
          label="Sport"
          value={form.sport}
          options={optionsWithCurrent(SPORT_PICKER_OPTIONS, form.sport)}
          searchable={false}
          onChange={(sport) => {
            setSportTouched(true);
            setSportOffer("");
            setForm((prev) => ({ ...prev, sport }));
          }}
          renderTrigger={pickerRow("Sport", form.sport)}
        />
      </EditGroup>
      {sportOfferNode}

      <EditGroup title="Details">
        <div className="flex flex-wrap gap-2 px-4 py-3" role="group" aria-label="Rookie, auto, patch">
          <Chip selected={isRookie} onClick={() => setIsRookie(!isRookie)}>
            Rookie
          </Chip>
          <Chip selected={isAuto} onClick={() => setIsAuto(!isAuto)}>
            Auto
          </Chip>
          <Chip selected={isRelic} onClick={() => setIsRelic(!isRelic)}>
            Patch / Relic
          </Chip>
        </div>
        <SearchSelect
          label="Grading company"
          value={gradeCompany}
          options={gradingCompanyOptions(gradeCompany)}
          searchable={false}
          dataField="gradingCompany"
          onChange={chooseGradeCompany}
          renderTrigger={pickerRow("Grading", graderShown, {
            error: companyMissing ? "Choose a company" : null,
            dataField: "gradingCompany",
          })}
        />
        {graded ? (
          <SearchSelect
            label="Grade"
            value={gradeNumber}
            options={gradeChoices}
            searchable={false}
            onChange={(number) => {
              markTouched("grade");
              setGradeNumber(number);
            }}
            renderTrigger={pickerRow("Grade", gradeNumber, {
              error: rowError("grade", !gradeNumber, "Choose a grade"),
              dataField: "grade",
            })}
          />
        ) : null}
        {graded && (certNumber.trim() || showMore) ? certRow : null}
        {graded && (gradeQualifier || showMore) ? qualifierRow : null}
      </EditGroup>

      <EditGroup title="Your money">
        <FieldSheetRow
          label="What you paid"
          value={form.purchasePrice}
          display={moneyRowValue(form.purchasePrice)}
          type="number"
          inputMode="decimal"
          prefix="$"
          inputPlaceholder="25.00"
          dataField="purchasePrice"
          error={rowError("purchasePrice", purchaseNeg, "Can't be negative")}
          onChange={(purchasePrice) => setForm((prev) => ({ ...prev, purchasePrice }))}
        />
        <FieldSheetRow
          label="Purchase date"
          value={form.purchaseDate}
          display={dateRowValue(form.purchaseDate)}
          type="date"
          dataField="purchaseDate"
          onChange={(purchaseDate) => setForm((prev) => ({ ...prev, purchaseDate }))}
        />
        <FieldSheetRow
          label="Your estimate"
          value={form.estimatedSellPrice}
          display={moneyRowValue(form.estimatedSellPrice)}
          type="number"
          inputMode="decimal"
          prefix="$"
          inputPlaceholder="25.00"
          dataField="estimatedSellPrice"
          error={rowError("estimatedSellPrice", estNeg, "Can't be negative")}
          onChange={(estimatedSellPrice) => setForm((prev) => ({ ...prev, estimatedSellPrice }))}
        />
      </EditGroup>

      <EditGroup title="Sold">
        <SheetRow
          label={sold ? "Sold" : "Mark as sold"}
          value={sold ? soldShown.replace(/^Sold · ?/, "") : ""}
          placeholder=""
          title="Mark as sold"
          dataField="sellPrice"
          error={
            touched.sellPrice && sellNeg
              ? "Can't be negative"
              : touched.sellPrice && sellMissing
                ? "Add the sold price"
                : null
          }
        >
          {() => (
            <SoldFields
              sold={sold}
              onSold={setSold}
              sellPrice={form.sellPrice}
              sellDate={form.sellDate}
              onSellPrice={(sellPrice) => {
                markTouched("sellPrice");
                setForm((prev) => ({ ...prev, sellPrice }));
              }}
              onSellDate={(sellDate) => setForm((prev) => ({ ...prev, sellDate }))}
            />
          )}
        </SheetRow>
      </EditGroup>

      <EditGroup title="Sharing">
        <SheetRow label="Who can see it" value={share ? "Public" : "Private"}>
          {() => (
            <div className="space-y-4">
              {visibilityNode}
              {offersNode}
            </div>
          )}
        </SheetRow>
        <SheetRow label="Category" value={categoryLabel(category)}>
          {() => categoryNode}
        </SheetRow>
      </EditGroup>

      <EditGroup>
        {hasNotes ? notesRow : null}
        {showMore ? (
          <>
            {serialShown ? null : serialRows}
            {graded && !certNumber.trim() ? certRow : null}
            {graded && !gradeQualifier ? qualifierRow : null}
            {hasNotes ? null : notesRow}
          </>
        ) : (
          <EditRow label="More details" value="Serial, cert #, notes" onClick={() => setMoreOpen(true)} />
        )}
      </EditGroup>

      {existing ? (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200/80 dark:bg-white/[0.035] dark:ring-white/[0.07]">
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete this card from your book?")) {
                removeCard(existing.id);
                router.push("/");
              }
            }}
            className={`flex min-h-12 w-full items-center px-4 text-left text-[15px] text-rose-600 transition-colors hover:bg-rose-500/5 dark:text-rose-400 ${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0`}
          >
            Delete card
          </button>
        </div>
      ) : null}

      {saveErrorNode}

      <StepDock>
        <PrimaryButton
          type="submit"
          form={editFormId}
          disabled={!editDirty || saving || readingPhoto}
          {...holdSave}
          onMouseDown={(e) => {
            // Keep focus so onBlur validation cannot swallow the first click.
            if (e.button === 0) e.preventDefault();
          }}
        >
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden data-slot="save-spinner" />
              Saving…
            </span>
          ) : (
            "Save"
          )}
        </PrimaryButton>
      </StepDock>
    </form>
  );
}

/** The quiet "Change photo" link under the slab, opening the photo controls in a sheet. */
function SheetRowButton({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <QuietButton className="mt-2" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        {label}
      </QuietButton>
      {open ? (
        <EditSheet
          title={title}
          onClose={close}
          footer={
            <StepDock layer="sheet">
              <PrimaryButton onClick={close}>Done</PrimaryButton>
            </StepDock>
          }
        >
          {children(close)}
        </EditSheet>
      ) : null}
    </>
  );
}

/** Your number and the run, side by side. Your number is focused, so the keyboard is up. */
function SerialFields({
  serialNo,
  serialRun,
  onSerialNo,
  onSerialRun,
}: {
  serialNo: string;
  serialRun: string;
  onSerialNo: (value: string) => void;
  onSerialRun: (value: string) => void;
}) {
  const first = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
      <label className="block min-w-0">
        <span className="mb-1.5 block text-sm text-zinc-500">Your number</span>
        <input
          ref={first}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={serialNo}
          onChange={(e) => onSerialNo(e.target.value)}
          placeholder="7"
          className={sheetFieldClass}
        />
      </label>
      <span className="pb-3 text-base text-zinc-400" aria-hidden>
        /
      </span>
      <label className="block min-w-0">
        <span className="mb-1.5 block text-sm text-zinc-500">Out of</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={serialRun}
          onChange={(e) => onSerialRun(e.target.value)}
          placeholder="99"
          aria-label="Serial run"
          className={sheetFieldClass}
        />
      </label>
    </div>
  );
}

/** "This card has been sold", then the price and date it sold for. */
function SoldFields({
  sold,
  onSold,
  sellPrice,
  sellDate,
  onSellPrice,
  onSellDate,
}: {
  sold: boolean;
  onSold: (value: boolean) => void;
  sellPrice: string;
  sellDate: string;
  onSellPrice: (value: string) => void;
  onSellDate: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Chip selected={sold} onClick={() => onSold(!sold)}>
        This card has been sold
      </Chip>
      {sold ? (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-500">Sold for</span>
            <span className="relative block">
              <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-base text-zinc-400">
                $
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                data-field="sellPrice"
                value={sellPrice}
                onChange={(e) => onSellPrice(e.target.value)}
                placeholder="25.00"
                className={`${sheetFieldClass} pl-8`}
              />
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-500">Date sold</span>
            <input
              type="date"
              data-field="sellDate"
              value={sellDate}
              onChange={(e) => onSellDate(e.target.value)}
              className={`${sheetFieldClass} appearance-none`}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function NotesField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <textarea
      rows={5}
      value={value}
      aria-label="Notes"
      onChange={(e) => onChange(e.target.value)}
      placeholder="Condition, centering, why you bought it"
      className={`${sheetFieldClass} min-h-32 resize-y py-3`}
    />
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
        <>
          <textarea
            rows={3}
            value={caption}
            aria-label="Caption"
            aria-invalid={caption.length > POST_LIMIT}
            onChange={(e) => onCaption(e.target.value)}
            className={`${inputClass} mt-3 resize-y`}
            placeholder="Add a caption"
          />
          <div className="mt-1 flex min-h-7 items-center justify-end">
            <CharacterRing length={caption.length} limit={POST_LIMIT} />
            <span className="sr-only" aria-live="polite">
              {caption.length}/{POST_LIMIT}
            </span>
          </div>
          {caption.length > POST_LIMIT ? (
            <p className="mt-1 text-xs leading-5 text-rose-600 dark:text-rose-400">
              Caption is over 280. Shorten it or turn off Share to feed.
            </p>
          ) : null}
        </>
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

/** Guided Add's "Also post to my feed", on Review next to Public / Private. */
function FeedPostField({
  control,
  caption,
  onShare,
  onCaption,
}: {
  control: { checked: boolean; disabled: boolean; explanation: string | null };
  caption: string;
  onShare: (value: boolean) => void;
  onCaption: (value: string) => void;
}) {
  const over = caption.length > POST_LIMIT;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
      <label className="flex min-h-11 items-center gap-3 font-semibold">
        <CheckHit>
          <input
            type="checkbox"
            checked={control.checked}
            disabled={control.disabled}
            onChange={(e) => onShare(e.target.checked)}
            className="size-5 accent-violet-500 disabled:opacity-40"
          />
        </CheckHit>
        {FEED_POST_LABEL}
      </label>
      {control.explanation ? (
        <p className="text-xs leading-5 text-zinc-500">{control.explanation}</p>
      ) : !control.checked ? (
        <p className="text-xs leading-5 text-zinc-500">Posts this card to your followers after it saves.</p>
      ) : null}
      {control.checked ? (
        <>
          <textarea
            rows={2}
            value={caption}
            aria-label="Post caption"
            aria-invalid={over}
            onChange={(e) => onCaption(e.target.value)}
            className={`${inputClass} mt-2 resize-y text-[15px]`}
            placeholder="Say something about it"
          />
          <div className="mt-1 flex min-h-7 items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">The card shows on the post. What you paid stays private.</p>
            <CharacterRing length={caption.length} limit={POST_LIMIT} />
            <span className="sr-only" aria-live="polite">
              {caption.length}/{POST_LIMIT}
            </span>
          </div>
          {over ? (
            <p className="mt-1 text-xs leading-5 text-rose-600 dark:text-rose-400">
              Caption is over 280. Shorten it or turn off {FEED_POST_LABEL}.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
