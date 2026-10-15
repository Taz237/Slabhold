/**
 * Browser Supabase config.
 *
 * Required in `.env.local` (see README):
 * - NEXT_PUBLIC_SUPABASE_URL — project URL, https://<ref>.supabase.co
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY — the project's publishable anon key
 *
 * Both must be the full values from the Supabase dashboard. Restart `npm run dev`
 * after changing them. Without a complete pair, Slabhold keeps accounts in this browser.
 */
export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const incomplete =
    !url ||
    !anonKey ||
    url.includes("YOUR_PROJECT") ||
    anonKey === "your-anon-key" ||
    anonKey.endsWith("...");
  const issue = incomplete
    ? url || anonKey
      ? "Supabase keys in .env.local look incomplete. Paste the full NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart the dev server."
      : null
    : null;

  return {
    url,
    anonKey,
    configured: Boolean(url && anonKey && !incomplete),
    issue,
  };
}
