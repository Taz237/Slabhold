"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { viewerIsAdmin } from "@/lib/safety/actions";

export function AdminNavLink({ className = "", item = false }: { className?: string; item?: boolean }) {
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

  const reports = (
    <Link href="/admin/reports" className={className}>
      Reports
    </Link>
  );
  const flags = (
    <Link href="/admin/comp-flags" className={className}>
      Comp flags
    </Link>
  );
  if (item) {
    return (
      <>
        <li>{reports}</li>
        <li>{flags}</li>
      </>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      {reports}
      {flags}
    </span>
  );
}
