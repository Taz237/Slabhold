"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { viewerIsAdmin } from "@/lib/safety/actions";

/** More-menu admin links. Hidden until the same admin check as the admin pages allows them. */
export function AdminMoreSection() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void viewerIsAdmin().then((allowed) => {
      if (!cancelled) setShow(allowed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  return (
    <section className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <h2 className="text-sm font-bold">Admin</h2>
      <ul className="mt-2 divide-y divide-zinc-200 text-sm dark:divide-white/10">
        <li>
          <Link href="/admin/reports" className="block py-3">
            Reports
          </Link>
        </li>
        <li>
          <Link href="/admin/comp-flags" className="block py-3">
            Comp flags
          </Link>
        </li>
      </ul>
    </section>
  );
}
