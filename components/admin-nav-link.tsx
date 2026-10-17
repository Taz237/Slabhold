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

  const link = (
    <Link href="/admin/reports" className={className}>
      Reports
    </Link>
  );
  return item ? <li>{link}</li> : link;
}
