import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportActions } from "@/components/report-actions";
import { adminAccess } from "@/lib/safety/admin";
import { loadOpenReports } from "@/lib/safety/moderation";
import { loadSignupSources, SIGNUP_SOURCE_WINDOW_DAYS, type SignupSourcesResult } from "@/lib/admin/signup-sources";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const userId = await getAuthUserId();
  if (adminAccess(userId) !== "allow") notFound();

  const [reports, signups] = await Promise.all([loadOpenReports(), loadSignupSources(createSupabaseAdmin())]);

  return (
    <div className="-mx-4 -mt-5">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/10">
        <h1 className="text-lg font-semibold">Open reports</h1>
        <p className="text-sm text-zinc-500">Oldest first. Highlighted rows have waited over 24 hours.</p>
        <Link href="/admin/comp-flags" className="mt-2 inline-block text-sm font-medium underline">
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
              <p className="text-sm font-semibold">
                Waiting {report.waitingLabel}
                {report.stale ? " · over 24h" : ""}
              </p>
              <p className="mt-1 text-sm">
                {report.reporter} reported {report.reported}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-semibold">{report.reason}</span>
                <span className="text-zinc-500"> · {report.targetType.replace("_", " ")}</span>
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
                <Link href={report.href} className="mt-2 inline-block text-sm font-medium underline">
                  View target
                </Link>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">Target unavailable</p>
              )}
              <ReportActions
                reportId={report.id}
                reported={report.reported}
                canModeratePost={report.canModeratePost}
                canDelete={report.canDelete}
                canHideVouch={report.canHideVouch}
                canRemoveVouchReply={report.canRemoveVouchReply}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="px-4 py-4 text-sm text-zinc-500">Lift a suspension in Supabase Auth</p>
      <SignupsBySource result={signups} />
    </div>
  );
}

/** Read-only: where new accounts came from, from auth user metadata. */
function SignupsBySource({ result }: { result: SignupSourcesResult }) {
  const cell = "px-2 py-2 text-right font-mono tabular-nums";
  return (
    <section aria-labelledby="signups-by-source" className="border-t border-zinc-200 px-4 py-4 dark:border-white/10">
      <h2 id="signups-by-source" className="text-15 font-semibold">
        Signups by source (last {SIGNUP_SOURCE_WINDOW_DAYS} days)
      </h2>
      {result.status === "unavailable" ? (
        <p className="mt-2 text-sm text-zinc-500">Couldn&apos;t read signups right now.</p>
      ) : result.rows.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">No signups in the last {SIGNUP_SOURCE_WINDOW_DAYS} days.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-white/10">
              <th scope="col" className="py-2 pr-2 font-medium">Source</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Web</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">iOS app</th>
              <th scope="col" className="py-2 pl-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.label} className="border-b border-zinc-200/70 dark:border-white/5">
                <th scope="row" className="py-2 pr-2 text-left font-medium">{row.label}</th>
                <td className={cell}>{row.web}</td>
                <td className={cell}>{row.ios}</td>
                <td className={`${cell} pr-0 font-semibold`}>{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-13 text-zinc-500">
        Accounts made before this tracking show as Not recorded. Apple and Google signups count once they pick a handle.
      </p>
    </section>
  );
}
