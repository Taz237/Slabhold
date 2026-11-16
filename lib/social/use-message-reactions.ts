"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { applyReaction, nextReaction, type MessageReaction, type ReactionEmoji } from "./message-reactions";
import { loadReactions, mergeLoaded, reactionEventMessageId, saveReaction } from "./message-reactions-remote";

/** A live event waits this long, so a quick swap reads once. */
const LIVE_READ_MS = 250;

/**
 * Reactions on one open thread. Reads them for the messages on screen,
 * listens to message_reactions on the same realtime connection as messages
 * (RLS keeps inserts and updates to the viewer's own chats; deletes are
 * matched by message_id), and saves the viewer's picks optimistically.
 * Without Supabase (local accounts) reactions live in memory.
 * `available` turns false when the table isn't there yet, and the thread
 * then offers no reactions.
 */
export function useMessageReactions(viewerId: string | null, messageIds: readonly string[]) {
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [available, setAvailable] = useState(true);
  const clientRef = useRef<SupabaseClient | null>(null);
  const idsRef = useRef<ReadonlySet<string>>(new Set());
  const savingRef = useRef(new Set<string>());
  const reactionsRef = useRef(reactions);
  useEffect(() => {
    reactionsRef.current = reactions;
  }, [reactions]);

  const key = messageIds.filter((id) => !id.startsWith("sending-")).join(",");

  const read = useCallback(async () => {
    const client = clientRef.current;
    const ids = [...idsRef.current];
    if (!client || ids.length === 0) return;
    try {
      const result = await loadReactions(client, ids);
      if (result.missing) {
        setAvailable(false);
        return;
      }
      const scope = { read: new Set(ids), saving: new Set(savingRef.current) };
      setReactions((prev) => mergeLoaded(prev, result.rows, scope));
    } catch {
      // A failed read keeps what's on screen. The next event or page reads again.
    }
  }, []);

  // One live listener per viewer, kept while messages come and go.
  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;
    let timer = 0;
    let stop = () => {};
    void loadSupabaseBrowser()
      .then((client) => {
        if (cancelled || !client) return;
        clientRef.current = client;
        void read();
        const channel = client
          .channel(`dm-reactions-${viewerId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "message_reactions" },
            (payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => {
              const id = reactionEventMessageId(payload);
              if (!id || !idsRef.current.has(id)) return;
              window.clearTimeout(timer);
              timer = window.setTimeout(() => void read(), LIVE_READ_MS);
            },
          )
          .subscribe();
        stop = () => void client.removeChannel(channel);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stop();
    };
  }, [read, viewerId]);

  // The messages on screen changed: read their reactions. A burst of
  // changes (a page of older messages landing) reads once.
  useEffect(() => {
    idsRef.current = new Set(key ? key.split(",") : []);
    if (!key) return;
    const timer = window.setTimeout(() => void read(), 0);
    return () => window.clearTimeout(timer);
  }, [key, read]);

  /** Pick an emoji: the same one again removes it, another swaps it. */
  const react = useCallback(
    async (messageId: string, picked: ReactionEmoji): Promise<{ error?: string }> => {
      if (!viewerId || messageId.startsWith("sending-")) return {};
      const before = reactionsRef.current;
      const current = before.find((item) => item.messageId === messageId && item.userId === viewerId)?.emoji ?? null;
      const emoji = nextReaction(current, picked);
      setReactions((list) => applyReaction(list, { messageId, userId: viewerId, emoji, at: new Date().toISOString() }));
      const client = clientRef.current;
      if (!client) return {};
      savingRef.current.add(messageId);
      const result = await saveReaction(client, { messageId, userId: viewerId, emoji }).catch(() => ({
        error: "Couldn't react to that message.",
        missing: false,
      }));
      savingRef.current.delete(messageId);
      if (result.error) {
        // Put back what was there before.
        const previous = before.find((item) => item.messageId === messageId && item.userId === viewerId) ?? null;
        setReactions((list) => [
          ...list.filter((item) => !(item.messageId === messageId && item.userId === viewerId)),
          ...(previous ? [previous] : []),
        ]);
        if ("missing" in result && result.missing) setAvailable(false);
        return { error: result.error };
      }
      return {};
    },
    [viewerId],
  );

  return { reactions, available, react };
}
