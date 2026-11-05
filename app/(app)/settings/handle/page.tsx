import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HandleSetup } from "@/components/onboarding/handle-setup";
import { HANDLE_PATH, needsHandle } from "@/lib/auth/oauth";
import { afterAuthPath, loginPath } from "@/lib/auth/safe-next";
import { createSupabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pick your handle · Slabhold" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

/** A new Apple or Google account picks its @handle, then goes on to first-run setup. */
export default async function HandlePage({ searchParams }: Props) {
  const raw = (await searchParams).next;
  const next = afterAuthPath(typeof raw === "string" ? raw : null);
  const supabase = await createSupabaseServer();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = data.user;
  if (!user) redirect(loginPath(`${HANDLE_PATH}?next=${encodeURIComponent(next)}`));
  if (!needsHandle(user)) redirect(next);
  const meta = (user.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
  return <HandleSetup next={next} suggestedName={name.trim()} />;
}
