"use client";

import { useEffect, useState } from "react";

export function AccountDeletedToast() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("notice") !== "account-deleted") return;
    setOpen(true);
    params.delete("notice");
    const next = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
  }, []);

  if (!open) return null;

  return (
    <div
      role="status"
      className="fixed top-4 left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg"
    >
      Your account has been deleted.
    </div>
  );
}
