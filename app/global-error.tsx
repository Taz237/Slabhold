"use client";

import { useEffect } from "react";
import { AppErrorScreen } from "@/components/app-error-screen";
import { reportClientError } from "@/lib/errors/client";

export default function GlobalError({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    reportClientError(error, "global-boundary");
  }, [error]);

  // Next 16's retry re-fetches this segment and then resets the boundary.
  return (
    <html lang="en">
      <head>
        <title>Something went wrong</title>
      </head>
      <body className="slab-error-root">
        <AppErrorScreen fill onTryAgain={retry ?? reset} />
      </body>
    </html>
  );
}
