"use server";

import { after } from "next/server";
import { consumeRequestLimit, consumeTrawlLimit } from "@/lib/comps/rate-limit";
import { toPublicAttachment } from "@/lib/social/card-posts";
import {
  commitMailDayWrites,
  mailDayPhotoOwnedBy,
  mailDayPhotosToRemove,
  removeMailDayPhotos,
  validateMailDayDraft,
  type MailDayInput,
  type PreparedMailDayCard,
} from "@/lib/social/mail-day";
import { isUuid } from "@/lib/value/card-value-access";
import { syncMentionNotifications } from "@/lib/social/remote";
import { uploadMedia } from "@/lib/supabase/media";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";
import { revalidateCard } from "@/lib/value/card-market";
import { refreshCardValue } from "@/lib/value/getCardValue";
import { notifyMailDayPost } from "@/lib/wants/dispatch";

export type MailDayActionResult =
  | { ok: true; cardId: string; cardIds: string[]; postId: string }
  | { ok: false; cardSaved: false; error: string }
  | { ok: false; cardSaved: true; cardId: string; cardIds: string[]; error: string };

function scheduleRefresh(userId: string, cardIds: readonly string[]) {
  for (const cardId of cardIds) {
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
      } finally {
        revalidateCard(cardId);
      }
    });
  }
}

export async function createMailDayPost(input: MailDayInput): Promise<MailDayActionResult> {
  const userId = await getAuthUserId();
  if (!userId) return { ok: false, cardSaved: false, error: "Log in to continue." };

  const supabase = await createSupabaseServer();
  if (!supabase) return { ok: false, cardSaved: false, error: "Accounts are not available right now." };

  const prepared = validateMailDayDraft(input);
  if (!prepared.ok) return { ok: false, cardSaved: false, error: prepared.error };

  const created: string[] = [];
  const uploaded: (PreparedMailDayCard & { id: string })[] = [];
  for (const card of prepared.cards) {
    const photos: string[] = [];
    for (const photo of card.photos) {
      if (photo.startsWith("data:")) {
        const stored = await uploadMedia(supabase, "card-photos", userId, photo);
        if (stored.error || !stored.url || !mailDayPhotoOwnedBy(stored.url, userId)) {
          await removeMailDayPhotos(supabase, userId, created);
          return {
            ok: false,
            cardSaved: false,
            error: stored.error || "Could not upload that photo.",
          };
        }
        created.push(stored.url);
        photos.push(stored.url);
        continue;
      }
      if (!mailDayPhotoOwnedBy(photo, userId)) {
        await removeMailDayPhotos(supabase, userId, created);
        return { ok: false, cardSaved: false, error: "Could not upload that photo." };
      }
      photos.push(photo);
    }
    uploaded.push({ ...card, id: card.id, photos });
  }

  const now = new Date().toISOString();
  const postId = input.postId && isUuid(input.postId) ? input.postId : crypto.randomUUID();
  const first = uploaded[0];
  const attachment = first
    ? toPublicAttachment({
        id: first.id,
        playerName: first.playerName,
        year: first.year,
        yearLabel: first.yearLabel,
        setBrand: first.setBrand,
        cardNumber: first.cardNumber,
        sport: first.sport,
        photoDataUrl: first.photos[0] ?? null,
        accent: "#7c5cff",
        estimatedSellPrice: 0,
        grade: first.gradeText,
        parallel: first.parallel,
        conditionType: first.conditionType,
        grader: first.grader,
      })
    : null;
  const result = await commitMailDayWrites({
    userId,
    postId,
    caption: prepared.caption,
    acquiredAt: prepared.acquiredAt,
    now,
    cards: uploaded,
    attachment,
    showPaid: Boolean(first?.showPaid),
    insertCard: async (row) => {
      const { error } = await supabase.from("cards").insert(row);
      return error;
    },
    insertPost: async (row) => {
      const { error } = await supabase.from("posts").insert(row);
      return error;
    },
    insertLinks: async (rows) => {
      const { error } = await supabase.from("post_cards").insert(rows);
      return error;
    },
    deletePost: async (id) => {
      await supabase.from("posts").delete().eq("id", id).eq("user_id", userId);
    },
  });

  if (!result.ok) {
    await removeMailDayPhotos(
      supabase,
      userId,
      mailDayPhotosToRemove(
        {
          cardSaved: result.cardSaved,
          error: result.error,
          cardIds: result.cardSaved ? result.cardIds : [],
        },
        uploaded,
        created,
      ),
    );
  }
  if (result.ok || result.cardSaved) scheduleRefresh(userId, result.cardIds);
  if (result.ok) {
    const mentionProblem = await syncMentionNotifications(
      supabase,
      userId,
      result.postId,
      prepared.caption,
    );
    if (mentionProblem) console.warn("[mail_day] mentions:", mentionProblem);
    for (const card of uploaded) {
      try {
        await notifyMailDayPost({
          actorId: userId,
          postId: result.postId,
          card: {
            id: card.id,
            playerName: card.playerName,
            year: card.year,
            yearLabel: card.yearLabel,
            setBrand: card.setBrand,
            cardNumber: card.cardNumber,
            parallel: card.parallel,
            grade: card.gradeText,
            grader: card.grader,
            conditionType: card.conditionType,
            isPublic: card.isPublic,
          },
        });
      } catch (err) {
        console.warn(
          "[mail_day] want alerts:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  return result;
}
