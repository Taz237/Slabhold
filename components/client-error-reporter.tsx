"use client";

import { useEffect } from "react";
import { installClientErrorReporting } from "@/lib/errors/client";

/** Sends uncaught errors and rejections to /api/client-error. Renders nothing. */
export function ClientErrorReporter() {
  useEffect(() => installClientErrorReporting(), []);
  return null;
}
