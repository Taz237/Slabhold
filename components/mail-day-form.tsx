"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ImagePlus, Plus, X } from "lucide-react";
import { createMailDayPost } from "@/app/mail-day/actions";
import { trackEvent } from "@/lib/analytics";
import { outlineButton, solidButton } from "@/components/button-styles";
import { CardSearch } from "@/components/card-search";
import { CategoryPicker } from "@/components/category-picker";
import { useCollection } from "@/components/collection-provider";
import { MailDayCard } from "@/components/mail-day-card";
import { MailDayHeading, MailDayPending } from "@/components/mail-day-pending";
import { useSocial } from "@/components/social-provider";
import { NativeSelect, SearchSelect, SET_PARALLEL_HINT } from "@/components/search-select";
import {
  GRADE_COMPANIES,
  SETS,
  gradeSelectOptions,
  optionsWithCurrent,
  yearOptionsForSport,
} from "@/lib/card-options";
import {
  parallelAfterSetChange,
  parallelChoice,
  parallelsForSet,
} from "@/lib/cards/parallels";
import {
  catalogPickStillMatches,
  shouldSubmitCatalogCard,
  submitCatalogCardQuietly,
  type CatalogPickSnapshot,
} from "@/lib/catalog/catalog-queue";
import {
  MAIL_DAY_MAX_CARDS,
  MAIL_DAY_SPORT_PICKER,
  SOURCE_LABELS,
  mailDayIsDirty,
  rookieAfterCatalogPick,
  sportAfterCatalogPick,
  textLooksRookie,
  mailDayPhotoOriginals,
  mailDayPhotosToRemove,
  mailDaySportLabel,
  restoreRemovedMailDayPhotos,
  mailDaySubmitBlocker,
  mailDaySubmitError,
  previewMailDayPost,
  removeMailDayPhotos,
  uploadMailDayPhotosWith,
  type AcquiredSource,
  type MailDayDraftCard,
} from "@/lib/social/mail-day";
import { POST_LIMIT } from "@/lib/social/types";
import { claimSubmit, isSaveTimeout, SAVE_TIMEOUT_MESSAGE, SaveTimeoutError, withSaveTimeout } from "@/lib/save/attempt";
import { fileToDataUrl } from "@/lib/storage";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { uploadMedia } from "@/lib/supabase/media";
import type { CardCategory, ConditionType } from "@/lib/types";

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100";

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function blankCard(): MailDayDraftCard & {
  key: string;
  cardId: string;
  open: boolean;
  parallelNote: string;
  sportOffer: string;
  catalogPick: CatalogPickSnapshot | null;
} {
  return {
    key: crypto.randomUUID(),
    cardId: crypto.randomUUID(),
    open: true,
    parallelNote: "",
    sportOffer: "",
    catalogPick: null,
    playerName: "",
    yearLabel: "",
    setBrand: "",
    setIsCustom: false,
    cardNumber: "",
    parallel: "Base",
    parallelIsCustom: false,
    isRookie: false,
    sport: "",
    conditionType: "raw",
    grader: "PSA",
    grade: "10",
    paid: "",
    source: "",
    category: "flipping",
    isPublic: false,
    showPaid: false,
    photos: [],
  };
}

type Section = ReturnType<typeof blankCard>;

function trackAddedCards(count: number) {
  const total = Math.max(0, Math.min(MAIL_DAY_MAX_CARDS, Math.floor(count)));
  for (let index = 0; index < total; index += 1) trackEvent("card_added");
}

function sectionDraft(section: Section): MailDayDraftCard {
  return {
    id: section.cardId,
    playerName: section.playerName,
    yearLabel: section.yearLabel,
    setBrand: section.setBrand,
    setIsCustom: section.setIsCustom,
    cardNumber: section.cardNumber,
    parallel: section.parallel,
    parallelIsCustom: section.parallelIsCustom,
    sport: section.sport,
    conditionType: section.conditionType,
    grader: section.grader,
    grade: section.grade,
    paid: section.paid,
    source: section.source,
    category: section.category,
    isPublic: section.isPublic,
    showPaid: section.showPaid,
    isRookie: section.isRookie,
    photos: section.photos,
  };
}

async function uploadMailDayPhotos(
  userId: string,
  cards: readonly MailDayDraftCard[],
  created: string[],
): Promise<MailDayDraftCard[]> {
  const supabase = createSupabaseBrowser();
  if (!supabase) throw new Error("Accounts are not available right now.");
  return withSaveTimeout((signal) =>
    uploadMailDayPhotosWith(
      async (photo) => {
        if (signal.aborted) throw new SaveTimeoutError();
        const stored = await uploadMedia(supabase, "card-photos", userId, photo);
        if (signal.aborted) throw new SaveTimeoutError();
        return stored;
      },
      cards,
      created,
    ),
  );
}

export function MailDayForm() {
  const router = useRouter();
  const { refresh, user, ready } = useSocial();
  const { reload } = useCollection();
  const fileRef = useRef<HTMLInputElement>(null);
  const allowLeave = useRef(false);
  const sendingRef = useRef(false);
  const postId = useRef(crypto.randomUUID());
  const [sections, setSections] = useState<Section[]>(() => [blankCard()]);
  const [active, setActive] = useState(0);
  const [photoTarget, setPhotoTarget] = useState(0);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedCardIds, setSavedCardIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const drafts = useMemo<MailDayDraftCard[]>(
    () => sections.map((section) => sectionDraft(section)),
    [sections],
  );
  const dirty = mailDayIsDirty(drafts, caption);
  const blocker = mailDaySubmitBlocker(drafts);
  const preview = useMemo(
    () => previewMailDayPost({ authorId: user?.id ?? "preview", caption, cards: drafts }),
    [user?.id, caption, drafts],
  );

  useEffect(() => {
    if (!sending) sendingRef.current = false;
  }, [sending]);

  useEffect(() => {
    if (!dirty || allowLeave.current) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  function queueCatalogSubmits(cardIds: readonly string[]) {
    const wanted = new Set(cardIds);
    for (const section of sections) {
      if (!wanted.has(section.cardId)) continue;
      const picked = catalogPickStillMatches(section.catalogPick, {
        playerName: section.playerName,
        yearLabel: section.yearLabel,
        setBrand: section.setBrand,
        cardNumber: section.cardNumber,
        parallel: section.parallel,
      });
      if (
        !shouldSubmitCatalogCard({
          setIsCustom: section.setIsCustom,
          parallelIsCustom: section.parallelIsCustom,
          pickedFromCatalog: picked,
        })
      ) {
        continue;
      }
      void submitCatalogCardQuietly(section.cardId);
    }
  }

  function update(index: number, patch: Partial<Section>) {
    setSections((current) =>
      current.map((section, item) => (item === index ? { ...section, ...patch } : section)),
    );
  }

  function askToLeave() {
    if (!dirty) {
      router.push("/");
      return;
    }
    setDiscardOpen(true);
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const index = photoTarget;
    const next = [...sections[index].photos];
    for (const file of Array.from(files)) {
      if (next.length >= 4) break;
      next.push(await fileToDataUrl(file, 960));
    }
    update(index, { photos: next, open: true });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocker) return;
    if (!claimSubmit(sendingRef)) return;
    setError(null);
    setSavedCardIds([]);
    setSending(true);
    const created: string[] = [];
    try {
      if (!user?.id) throw new Error("Log in to log a Mail Day.");
      let cards: MailDayDraftCard[];
      try {
        cards = await uploadMailDayPhotos(user.id, drafts, created);
      } catch (err) {
        if (isSaveTimeout(err)) {
          setError(SAVE_TIMEOUT_MESSAGE);
          return;
        }
        await removeMailDayPhotos(createSupabaseBrowser(), user.id, created);
        setError(mailDaySubmitError(err));
        return;
      }
      const originals = mailDayPhotoOriginals(drafts, cards);
      setSections((current) =>
        current.map((section, index) =>
          cards[index] ? { ...section, photos: cards[index].photos } : section,
        ),
      );
      let result: Awaited<ReturnType<typeof createMailDayPost>>;
      try {
        result = await withSaveTimeout(() =>
          createMailDayPost({
            caption,
            cards,
            acquiredAt: today(),
            postId: postId.current,
          }),
        );
      } catch (err) {
        if (!isSaveTimeout(err)) throw err;
        setError(SAVE_TIMEOUT_MESSAGE);
        return;
      }
      if (!result.ok) {
        const removed = mailDayPhotosToRemove(
          {
            cardSaved: result.cardSaved,
            error: result.error,
            cardIds: result.cardSaved ? result.cardIds : [],
          },
          cards,
          created,
        );
        await removeMailDayPhotos(createSupabaseBrowser(), user.id, removed);
        setSections((current) => restoreRemovedMailDayPhotos(current, removed, originals));
        setError(result.error);
        if (result.cardSaved) {
          trackAddedCards(result.cardIds.length);
          queueCatalogSubmits(result.cardIds);
          setSavedCardIds(result.cardIds);
          reload();
        }
        return;
      }
      trackAddedCards(result.cardIds.length);
      trackEvent("post_created");
      queueCatalogSubmits(result.cardIds);
      allowLeave.current = true;
      reload();
      await refresh();
      router.push("/");
    } catch (err) {
      setError(mailDaySubmitError(err));
    } finally {
      setSending(false);
    }
  }

  if (!ready) return <MailDayPending />;

  return (
    <div className="space-y-8">
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <MailDayHeading />
          <button type="button" onClick={askToLeave} className={outlineButton}>
            Back
          </button>
        </div>

        {sections.map((section, index) => (
          <section
            key={section.key}
            className="rounded-2xl border border-zinc-200 dark:border-white/10"
            onFocus={() => setActive(index)}
          >
            <div className="flex items-center gap-2 px-3 py-3">
              <button
                type="button"
                aria-expanded={section.open}
                onClick={() => update(index, { open: !section.open })}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <ChevronDown className={`h-4 w-4 shrink-0 ${section.open ? "" : "-rotate-90"}`} />
                <span className="truncate text-sm font-bold">
                  Card {index + 1}
                  {section.playerName.trim() ? ` · ${section.playerName.trim()}` : ""}
                </span>
              </button>
              {sections.length > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setSections((current) => current.filter((item) => item.key !== section.key));
                    setActive(0);
                  }}
                  className="text-sm font-semibold text-zinc-500"
                >
                  Remove
                </button>
              ) : null}
            </div>
            {section.open ? (
              <div className="space-y-4 px-3 pb-4">
                <CardSearch
                  onSelect={(card) => {
                    setActive(index);
                    const chosen = parallelChoice(card.setBrand, card.parallel || "Base");
                    const sport = sportAfterCatalogPick(section.sport, card.sport);
                    update(index, {
                      playerName: card.playerName,
                      yearLabel: card.yearLabel,
                      setBrand: card.setBrand,
                      setIsCustom: !SETS.some((item) => item === card.setBrand),
                      cardNumber: card.cardNumber,
                      parallel: chosen.parallel,
                      parallelIsCustom: chosen.parallelIsCustom,
                      parallelNote: "",
                      sport: sport.sport,
                      sportOffer: sport.offer,
                      isRookie: rookieAfterCatalogPick(section.isRookie, card),
                      catalogPick: {
                        playerName: card.playerName,
                        yearLabel: card.yearLabel,
                        setBrand: card.setBrand,
                        cardNumber: card.cardNumber,
                        parallel: chosen.parallel,
                      },
                    });
                  }}
                  onManual={(prefill) => {
                    setActive(index);
                    update(index, {
                      playerName: prefill.playerName || section.playerName,
                      yearLabel: prefill.yearLabel || section.yearLabel,
                      cardNumber: prefill.cardNumber || section.cardNumber,
                      catalogPick: null,
                    });
                  }}
                />
                {section.sportOffer ? (
                  <button
                    type="button"
                    onClick={() =>
                      update(index, { sport: section.sportOffer, sportOffer: "" })
                    }
                    className="text-left text-xs font-semibold text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
                  >
                    This card is listed as {mailDaySportLabel(section.sportOffer)}. Use that?
                  </button>
                ) : null}
                <PhotoRow
                  photos={section.photos}
                  onRemove={(src) =>
                    update(index, { photos: section.photos.filter((item) => item !== src) })
                  }
                  onAdd={() => {
                    setPhotoTarget(index);
                    setActive(index);
                    fileRef.current?.click();
                  }}
                />
                <label className="block text-sm font-semibold">
                  Player
                  <input
                    value={section.playerName}
                    onChange={(event) => update(index, { playerName: event.target.value })}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-sm font-semibold">Year</p>
                    <SearchSelect
                      label="Year"
                      value={section.yearLabel}
                      options={yearOptionsForSport(section.sport || "Baseball")}
                      allowCustom
                      onChange={(yearLabel) => update(index, { yearLabel })}
                    />
                  </div>
                  <label className="block text-sm font-semibold">
                    Sport
                    <select
                      value={section.sport}
                      onChange={(event) =>
                        update(index, { sport: event.target.value, sportOffer: "" })
                      }
                      className={`${inputClass} mt-1`}
                      aria-label={`Sport for card ${index + 1}`}
                    >
                      <option value="">Choose a sport</option>
                      {optionsWithCurrent([...MAIL_DAY_SPORT_PICKER], section.sport).map((sport) => (
                        <option key={sport} value={sport}>
                          {mailDaySportLabel(sport)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-sm font-semibold">
                  Number
                  <input
                    value={section.cardNumber}
                    onChange={(event) => update(index, { cardNumber: event.target.value })}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <div>
                  <p className="mb-1 text-sm font-semibold">Set</p>
                  <SearchSelect
                    label="Set"
                    value={section.setBrand}
                    options={optionsWithCurrent(SETS, section.setBrand)}
                    allowCustom
                    customHint={SET_PARALLEL_HINT}
                    onChange={(setBrand) => {
                      const known = SETS.some((item) => item.toLowerCase() === setBrand.toLowerCase());
                      const next = parallelAfterSetChange({
                        parallel: section.parallel,
                        parallelIsCustom: section.parallelIsCustom,
                        setBrand,
                      });
                      update(index, {
                        setBrand,
                        setIsCustom: Boolean(setBrand) && !known,
                        parallel: next.parallel,
                        parallelIsCustom: next.parallelIsCustom,
                        parallelNote: next.reset ? "Parallel reset for this set" : "",
                      });
                    }}
                  />
                </div>
                <div>
                  <p className="mb-1 text-sm font-semibold">Parallel</p>
                  <SearchSelect
                    label="Parallel"
                    value={section.parallel}
                    options={optionsWithCurrent([...parallelsForSet(section.setBrand)], section.parallel)}
                    allowCustom
                    customHint={SET_PARALLEL_HINT}
                    onChange={(parallel) => {
                      const next = parallelChoice(section.setBrand, parallel);
                      update(index, {
                        parallel: next.parallel,
                        parallelIsCustom: next.parallelIsCustom,
                        parallelNote: "",
                        isRookie: section.isRookie || textLooksRookie(next.parallel),
                      });
                    }}
                  />
                  {section.parallelNote ? (
                    <p className="mt-1 text-xs text-zinc-500">{section.parallelNote}</p>
                  ) : null}
                  <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={section.isRookie}
                      onChange={(event) => update(index, { isRookie: event.target.checked })}
                      className="size-5 shrink-0 accent-violet-500"
                    />
                    RC / Rookie
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Condition">
                  {(["raw", "graded"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={section.conditionType === option}
                      onClick={() => update(index, { conditionType: option as ConditionType })}
                      className={`min-h-11 rounded-full text-sm font-bold ${
                        section.conditionType === option
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                          : "border border-zinc-200 dark:border-white/10"
                      }`}
                    >
                      {option === "raw" ? "Raw" : "Graded"}
                    </button>
                  ))}
                </div>
                {section.conditionType === "graded" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1 text-sm font-semibold">Grader</p>
                      <NativeSelect
                        label="Grader"
                        value={section.grader}
                        options={[...GRADE_COMPANIES]}
                        onChange={(grader) => update(index, { grader })}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-semibold">Grade</p>
                      <NativeSelect
                        label="Grade"
                        value={section.grade}
                        options={gradeSelectOptions(section.grader, section.grade)}
                        onChange={(grade) => update(index, { grade })}
                      />
                    </div>
                  </div>
                ) : null}
                <label className="block text-sm font-semibold">
                  Price paid
                  <input
                    inputMode="decimal"
                    value={section.paid}
                    onChange={(event) => update(index, { paid: event.target.value })}
                    placeholder="0.00"
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Source
                  <select
                    value={section.source}
                    onChange={(event) =>
                      update(index, { source: event.target.value as AcquiredSource | "" })
                    }
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
                <CategoryPicker
                  value={section.category}
                  onChange={(category: CardCategory) => update(index, { category })}
                />
                <label className="flex items-center justify-between gap-3 text-sm font-semibold">
                  Public card
                  <input
                    type="checkbox"
                    checked={section.isPublic}
                    onChange={(event) => update(index, { isPublic: event.target.checked })}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm font-semibold">
                  Show what I paid
                  <input
                    type="checkbox"
                    checked={section.showPaid}
                    onChange={(event) => update(index, { showPaid: event.target.checked })}
                  />
                </label>
                <p className="text-xs text-zinc-500">
                  Paid stays on your card. It shows on the post only when this is on, and never when the card is private.
                </p>
              </div>
            ) : null}
          </section>
        ))}

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

        {sections.length < MAIL_DAY_MAX_CARDS ? (
          <button
            type="button"
            onClick={() => {
              const next = blankCard();
              setSections((current) => [...current, next]);
              setActive(sections.length);
            }}
            className={`${outlineButton} gap-2`}
          >
            <Plus className="h-4 w-4" />
            Add another card
          </button>
        ) : null}

        <label className="block text-sm font-semibold">
          Caption
          <textarea
            value={caption}
            maxLength={POST_LIMIT}
            rows={3}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Optional, for the whole post"
            className={`${inputClass} mt-1 resize-none`}
          />
        </label>

        {blocker ? (
          <p className="text-sm text-zinc-500" role="status">
            {blocker}
          </p>
        ) : null}
        {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
        {error ? (
          <button type="submit" disabled={sending || Boolean(blocker)} className={solidButton}>
            Retry
          </button>
        ) : null}
        {savedCardIds.map((id) => (
          <Link key={id} href={`/cards/${id}`} className={outlineButton}>
            Open the saved card
          </Link>
        ))}
        <button type="submit" disabled={sending || Boolean(blocker)} className={solidButton}>
          {sending ? "Saving…" : "Log Mail Day"}
        </button>
      </form>

      <section aria-label="Preview" className="space-y-2">
        <h2 className="text-sm font-bold">Preview</h2>
        <p className="text-xs text-zinc-500">This is what other people will see.</p>
        <div className="pointer-events-none overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
          <MailDayCard post={preview} username={user?.username ?? ""} variant="feed" asViewer="other" />
        </div>
      </section>

      {discardOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-mail-day"
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-zinc-900">
            <h2 id="discard-mail-day" className="text-lg font-bold">
              Discard Mail Day?
            </h2>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDiscardOpen(false)} className={outlineButton}>
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  allowLeave.current = true;
                  router.push("/");
                }}
                className={solidButton}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <span className="sr-only">Active card {active + 1}</span>
    </div>
  );
}

function PhotoRow({
  photos,
  onRemove,
  onAdd,
}: {
  photos: string[];
  onRemove: (src: string) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">Photos</p>
      <div className="grid grid-cols-4 gap-2">
        {photos.map((src, index) => (
          <div key={`${src.slice(0, 32)}-${index}`} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="aspect-square w-full rounded-xl object-cover" />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => onRemove(src)}
              className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {photos.length < 4 ? (
          <button
            type="button"
            onClick={onAdd}
            className="grid aspect-square place-items-center rounded-xl border border-dashed border-zinc-300 text-zinc-500 dark:border-white/15"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-zinc-500">1 to 4 photos</p>
    </div>
  );
}
