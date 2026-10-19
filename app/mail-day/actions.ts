"use server";

import { after } from "next/server";
import {
  formatGrade,
  isValidCardNumber,
  isValidYear,
  normalizeCardNumberInput,
  parseYearLabel,
} from "@/lib/card-options";
import { consumeRequestLimit, consumeTrawlLimit } from "@/lib/comps/rate-limit";
import { toPublicAttachment } from "@/lib/social/card-posts";
import {
  mailDayMeta,
  parseAcquiredSource,
  runMailDaySave,
  type MailDayInput,
} from "@/lib/social/mail-day";
import { syncMentionNotifications } from "@/lib/social/remote";
import { POST_LIMIT } from "@/lib/social/types";
import { uploadMedia } from "@/lib/supabase/media";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";
import { refreshCardValue } from "@/lib/value/getCardValue";

export type MailDayActionResult =
  | { ok: true; cardId: string; postId: string }
  | { ok: false; cardSaved: false; error: string }
  | { ok: false; cardSaved: true; cardId: string; error: string };

function scheduleRefresh(userId: string, cardId: string) {
  after(async () => {
    try {
      await refreshCardValue(cardId, {
        beforeRequest: () => consumeRequestLimit(userId),
        beforeTrawl: () => consumeTrawlLimit(userId),
      });
    } catch (err) {
      console.warn(
        "[mail_day] refresh failed:",
        err instanceof Error ? err.message : err,
      );
    }
  });
}

function parsePaid(value: string): { ok: true; paid: number | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, paid: null };
  const paid = Number(trimmed);
  if (!Number.isFinite(paid) || paid < 0) return { ok: false, error: "Enter a valid price paid." };
  if (paid === 0) return { ok: true, paid: null };
  return { ok: true, paid };
}

export async function createMailDayPost(input: MailDayInput): Promise<MailDayActionResult> {
  const userId = await getAuthUserId();
  if (!userId) return { ok: false, cardSaved: false, error: "Log in to log a Mail Day." };

  const supabase = await createSupabaseServer();
  if (!supabase) return { ok: false, cardSaved: false, error: "Accounts are not available right now." };

  const playerName = input.playerName.trim();
  const setBrand = input.setBrand.trim();
  const yearLabel = input.yearLabel.trim();
  const parsedYear = parseYearLabel(yearLabel);
  const source = parseAcquiredSource(input.source);
  const photos = (input.photos ?? []).filter((photo) => photo.startsWith("data:"));
  const caption = input.caption.trim();
  const conditionType = input.conditionType === "graded" ? "graded" : "raw";
  const cardNumber = normalizeCardNumberInput(input.cardNumber);
  const paid = parsePaid(input.paid ?? "");

  if (!playerName) return { ok: false, cardSaved: false, error: "Add the player." };
  if (!parsedYear || !isValidYear(yearLabel)) {
    return { ok: false, cardSaved: false, error: "Use a year like 2025 or 2024-25." };
  }
  if (!setBrand) return { ok: false, cardSaved: false, error: "Add the set." };
  if (cardNumber && !isValidCardNumber(cardNumber)) {
    return { ok: false, cardSaved: false, error: "Check the card number." };
  }
  if (conditionType === "graded" && (!input.grader.trim() || !input.grade.trim())) {
    return { ok: false, cardSaved: false, error: "Add the grader and grade." };
  }
  if (!source) return { ok: false, cardSaved: false, error: "Choose where you picked it up." };
  if (photos.length < 1 || photos.length > 4) {
    return { ok: false, cardSaved: false, error: "Add 1 to 4 photos." };
  }
  if (!paid.ok) return { ok: false, cardSaved: false, error: paid.error };
  if (caption.length > POST_LIMIT) {
    return { ok: false, cardSaved: false, error: "Keep the caption to 280 characters." };
  }
  if (input.category !== "pc" && input.category !== "flipping") {
    return { ok: false, cardSaved: false, error: "Choose PC or Flipping." };
  }

  const acquiredAt = /^\d{4}-\d{2}-\d{2}$/.test(input.acquiredAt)
    ? input.acquiredAt
    : new Date().toISOString().slice(0, 10);
  const isPublic = Boolean(input.isPublic);
  const showPaid = Boolean(input.showPaid) && isPublic;
  const gradeText =
    conditionType === "raw" ? "Raw" : formatGrade(input.grader.trim(), input.grade.trim());
  const grader = conditionType === "graded" ? input.grader.trim() : null;
  const gradeValue = conditionType === "graded" ? input.grade.trim() : "Raw";
  const parallel = input.parallel.trim() || "Base";
  const cardId = crypto.randomUUID();
  const now = new Date().toISOString();

  const uploaded: string[] = [];
  for (const photo of photos) {
    const stored = await uploadMedia(supabase, "card-photos", userId, photo);
    if (stored.error || !stored.url) {
      return { ok: false, cardSaved: false, error: stored.error || "Could not upload that photo." };
    }
    uploaded.push(stored.url);
  }

  const result = await runMailDaySave({
    saveCard: async () => {
      const { error } = await supabase.from("cards").insert({
        id: cardId,
        user_id: userId,
        player: playerName,
        year: parsedYear.year,
        year_label: parsedYear.yearLabel,
        set: setBrand,
        set_name: setBrand,
        grade: gradeValue,
        grader,
        parallel,
        card_number: cardNumber,
        sport: input.sport.trim() || "Basketball",
        condition_type: conditionType,
        category: input.category,
        is_public: isPublic,
        paid_price: paid.paid,
        acquired_source: source,
        acquired_at: acquiredAt,
        image_url: uploaded[0] ?? null,
        estimated_value: 0,
        accent: "#7c5cff",
        created_at: now,
        updated_at: now,
      });
      if (error) return { ok: false as const, error: "Could not save that card." };
      return { ok: true as const, cardId };
    },
    savePost: async (savedCardId) => {
      const attachment = toPublicAttachment({
        id: savedCardId,
        playerName,
        year: parsedYear.year,
        yearLabel: parsedYear.yearLabel,
        setBrand,
        cardNumber,
        sport: input.sport.trim() || "Basketball",
        photoDataUrl: uploaded[0] ?? null,
        accent: "#7c5cff",
        estimatedSellPrice: 0,
        grade: gradeText,
        parallel,
        conditionType,
        grader,
      });
      const { data, error } = await supabase
        .from("posts")
        .insert({
          user_id: userId,
          content: caption,
          image_url: uploaded[0] ?? null,
          card: attachment,
          post_type: "mail_day",
          show_paid: showPaid,
          meta: mailDayMeta({
            source,
            photos: uploaded,
            isPublic,
            acquiredAt,
          }),
        })
        .select("id")
        .single();
      if (error || !data) return { ok: false as const };
      return { ok: true as const, postId: data.id as string };
    },
  });

  if (result.ok || result.cardSaved) scheduleRefresh(userId, result.cardId);
  if (result.ok) {
    const mentionProblem = await syncMentionNotifications(supabase, userId, result.postId, caption);
    if (mentionProblem) console.warn("[mail_day] mentions:", mentionProblem);
  }
  return result;
}
