import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportActions } from "@/components/report-actions";
import { adminAccess } from "@/lib/safety/admin";
import { loadOpenReports } from "@/lib/safety/moderation";
import { getAuthUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const userId = await getAuthUserId();
  if (adminAccess(userId) !== "allow") notFound();

  const reports = await loadOpenReports();

  return (
    <div className="-mx-4 -mt-5">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/10">
        <h1 className="text-lg font-bold">Open reports</h1>
        <p className="text-sm text-zinc-500">Oldest first. Highlighted rows have waited over 24 hours.</p>
        <Link href="/admin/comp-flags" className="mt-2 inline-block text-sm font-bold underline">
          Comp flags
        </Link>
      </div>
      {reports.length === 0 ? (
        <p className="px-4 py-8 text-sm text-zinc-500">No open reports.</p>
      ) : (
        <ul>
          {reports.map((report) => (
            <li
              key={report.id}
              className={`border-b border-zinc-200 px-4 py-4 dark:border-white/10 ${
                report.stale ? "bg-amber-50 dark:bg-amber-400/10" : ""
              }`}
            >
              <p className="text-sm font-bold">
                Waiting {report.waitingLabel}
                {report.stale ? " · over 24h" : ""}
              </p>
              <p className="mt-1 text-sm">
                {report.reporter} reported {report.reported}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-bold">{report.reason}</span>
                <span className="text-zinc-500"> · {report.targetType}</span>
              </p>
              {report.details ? (
                <p className="mt-2 text-sm leading-5 whitespace-pre-wrap">{report.details}</p>
              ) : null}
              {report.preview ? (
                <p className="mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-300">
                  {report.preview}
                </p>
              ) : null}
              {report.href ? (
                <Link href={report.href} className="mt-2 inline-block text-sm font-bold underline">
                  View target
                </Link>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">Target unavailable</p>
              )}
              <ReportActions
                reportId={report.id}
                canModeratePost={report.canModeratePost}
                canDelete={report.canDelete}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
