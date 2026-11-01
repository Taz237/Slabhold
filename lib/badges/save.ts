import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";

type Saved = { ok: true } | { ok: false; error: string };

async function ownId() {
  const supabase = await loadSupabaseBrowser();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  return id ? { supabase, id } : null;
}

/** RLS limits these writes to the signed-in owner. The pin trigger rejects unearned pins. */
export async function savePinnedBadges(pins: readonly string[]): Promise<Saved> {
  const own = await ownId();
  if (!own) return { ok: false, error: "Sign in to pin badges." };
  const { error } = await own.supabase.from("profiles").update({ pinned_badges: pins }).eq("id", own.id);
  return error ? { ok: false, error: "Couldn't save your pins. Try again." } : { ok: true };
}

export async function saveShowBadges(show: boolean): Promise<Saved> {
  const own = await ownId();
  if (!own) return { ok: false, error: "Sign in to change this." };
  const { error } = await own.supabase.from("profiles").update({ show_badges: show }).eq("id", own.id);
  return error ? { ok: false, error: "Couldn't save that. Try again." } : { ok: true };
}

/** The owner can update only seen_at. */
export async function markBadgesSeen(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const own = await ownId();
  if (!own) return;
  await own.supabase
    .from("user_badges")
    .update({ seen_at: new Date().toISOString() })
    .eq("user_id", own.id)
    .in("id", [...ids]);
}
