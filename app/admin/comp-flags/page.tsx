import Link from "next/link";
import { notFound } from "next/navigation";
import { CompFlagsAdmin } from "@/components/comp-flags-admin";
import { adminAccess } from "@/lib/safety/admin";
import { getAuthUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminCompFlagsPage() {
  const userId = await getAuthUserId();
  if (adminAccess(userId) !== "allow") notFound();

  return (
    <div className="-mx-4 -mt-5">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/10">
        <h1 className="text-lg font-bold">Comp flags</h1>
        <p className="text-sm text-zinc-500">
          Search by card id or username, then restore a hidden sale.
        </p>
        <Link href="/admin/reports" className="mt-2 inline-block text-sm font-bold underline">
          Open reports
        </Link>
      </div>
      <CompFlagsAdmin />
    </div>
  );
}
