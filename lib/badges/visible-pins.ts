import type { SupabaseClient } from "@supabase/supabase-js";

/** PostgREST and Postgres codes for a table or view that isn't there yet. */
const MISSING_RELATION = new Set(["PGRST205", "42P01"]);

function pins(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * A profile's pins as this client may see them. profile_badge_pins returns
 * none to other viewers when show_badges is off. Until that view's migration
 * runs, the profiles column is read instead.
 */
export async function readVisiblePins(supabase: SupabaseClient, profileId: string): Promise<string[]> {
  const view = await supabase.from("profile_badge_pins").select("pinned_badges").eq("id", profileId).maybeSingle();
  if (!view.error) return pins(view.data?.pinned_badges);
  if (!MISSING_RELATION.has(view.error.code ?? "")) return [];
  const legacy = await supabase.from("profiles").select("pinned_badges").eq("id", profileId).maybeSingle();
  return legacy.error ? [] : pins(legacy.data?.pinned_badges);
}
