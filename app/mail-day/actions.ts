"use server";

import { after } from "next/server";
import { consumeRequestLimit, consumeTrawlLimit } from "@/lib/comps/rate-limit";
import { toPublicAttachment } from "@/lib/social/card-posts";
import {
  mailDayCardRecord,
  mailDayMeta,
  mailDayPhotoOwnedBy,
  mailDayPhotosToRemove,
  removeMailDayPhotos,
  runMailDaySave,
  validateMailDayDraft,
  type MailDayInput,
  type PreparedMailDayCard,
} from "@/lib/social/mail-day";
import { syncMentionNotifications } from "@/lib/social/remote";
import { uploadMedia } from "@/lib/supabase/media";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";
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
      }
    });
  }
}

export async function createMailDayPost(input: MailDayInput): Promise<MailDayActionResult> {
  const userId = await getAuthUserId();
  if (!userId) return { ok: false, cardSaved: false, error: "Log in to log a Mail Day." };

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
    uploaded.push({ ...card, id: crypto.randomUUID(), photos });
  }

  const now = new Date().toISOString();
  const result = await runMailDaySave({
    saveCards: async () => {
      const cardIds: string[] = [];
      for (const card of uploaded) {
        const { error } = await supabase
          .from("cards")
          .insert(mailDayCardRecord(userId, card, prepared.acquiredAt, now));
        if (error) {
          console.warn("[mail_day] card:", error.message);
          return cardIds.length
            ? { ok: false as const, error: "Could not save that card.", cardIds }
            : { ok: false as const, error: "Could not save that card." };
        }
        cardIds.push(card.id);
      }
      return { ok: true as const, cardIds };
    },
    savePost: async (cardIds) => {
      const saved = uploaded.filter((card) => cardIds.includes(card.id));
      const first = saved[0];
      if (!first) return { ok: false as const };
      const attachment = toPublicAttachment({
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
      });
      const { data, error } = await supabase
        .from("posts")
        .insert({
          user_id: userId,
          content: prepared.caption,
          image_url: first.photos[0] ?? null,
          card: attachment,
          post_type: "mail_day",
          show_paid: first.showPaid,
          meta: mailDayMeta({
            acquiredAt: prepared.acquiredAt,
            cards: saved.map((card) => ({
              id: card.id,
              photos: card.photos,
              source: card.source,
              showPaid: card.showPaid,
              playerName: card.playerName,
              year: card.year,
              yearLabel: card.yearLabel,
              setBrand: card.setBrand,
              cardNumber: card.cardNumber,
              sport: card.sport,
              parallel: card.parallel,
              grade: card.gradeText,
              conditionType: card.conditionType,
              grader: card.grader,
            })),
          }),
        })
        .select("id")
        .single();
      if (error || !data) {
        if (error) console.warn("[mail_day] post:", error.message);
        return { ok: false as const };
      }
      const postId = data.id as string;
      const { error: linkError } = await supabase.from("post_cards").insert(
        saved.map((card, position) => ({
          post_id: postId,
          card_id: card.id,
          position,
        })),
      );
      if (linkError) {
        console.warn("[mail_day] post_cards:", linkError.message);
        await supabase.from("posts").delete().eq("id", postId).eq("user_id", userId);
        return { ok: false as const };
      }
      return { ok: true as const, postId };
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
