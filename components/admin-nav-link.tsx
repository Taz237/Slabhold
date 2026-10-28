"use client";

import { useEffect, useState, type ReactNode } from "react";
import { viewerIsAdmin } from "@/lib/safety/actions";
import { SIDE_MENU_ADMIN } from "@/lib/ui/side-menu";

type AdminLink = (typeof SIDE_MENU_ADMIN)[number];

/** Side-menu admin rows. Hidden until the same admin check as the admin pages allows them. */
export function AdminMenuLinks({ renderLink }: { renderLink: (item: AdminLink) => ReactNode }) {
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
    <>
      {SIDE_MENU_ADMIN.map((item) => (
        <li key={item.href}>{renderLink(item)}</li>
      ))}
    </>
  );
}
