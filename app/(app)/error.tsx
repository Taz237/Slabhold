"use client";

import { useEffect } from "react";
import { AppErrorScreen } from "@/components/app-error-screen";

export default function AppError({
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
  }, [error]);

  // Next 16's retry re-fetches this segment and then resets the boundary.
  return <AppErrorScreen onTryAgain={retry ?? reset} />;
}
