import { normalizeRoute, scrubText, shortStack, type ReportKind } from "@/lib/errors/report";
import { isNativeApp } from "@/lib/ios/platform";

export const CLIENT_ERROR_PATH = "/api/client-error";

/** Reports per page load. A crash loop sends a few, never hundreds. */
export const CLIENT_REPORT_CAP = 10;

/** The deployed build, so a report says which version broke. */
export const APP_VERSION = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "dev";

type ErrorWindow = Pick<Window, "addEventListener" | "removeEventListener"> & {
  location: Pick<Location, "pathname">;
};

function describe(reason: unknown): { message: string; stack: string | null } {
  if (reason instanceof Error) {
    const name = reason.name && reason.name !== "Error" ? `${reason.name}: ` : "";
    return { message: `${name}${reason.message}`, stack: reason.stack ?? null };
  }
  if (typeof reason === "string") return { message: reason, stack: null };
  try {
    return { message: JSON.stringify(reason) ?? String(reason), stack: null };
  } catch {
    return { message: String(reason), stack: null };
  }
}

/** Beacon first: it survives the page closing. Fetch keepalive otherwise. */
function beacon(body: string) {
  const blob = new Blob([body], { type: "application/json" });
  if (typeof navigator !== "undefined" && navigator.sendBeacon?.(CLIENT_ERROR_PATH, blob)) return;
  void fetch(CLIENT_ERROR_PATH, {
    method: "POST",
    body,
    keepalive: true,
    headers: { "content-type": "application/json" },
  }).catch(() => {});
}

export function createClientReporter({
  send = beacon,
  platform = () => (isNativeApp() ? "ios" : "web"),
  version = APP_VERSION,
  win = typeof window === "undefined" ? null : window,
}: {
  send?: (body: string) => void;
  platform?: () => "ios" | "web";
  version?: string;
  win?: ErrorWindow | null;
} = {}) {
  const seen = new Set<string>();
  let sent = 0;

  function report(reason: unknown, kind: ReportKind) {
    try {
      if (sent >= CLIENT_REPORT_CAP) return;
      const { message, stack } = describe(reason);
      const clean = scrubText(message) || "(no message)";
      const key = `${kind}:${clean}`;
      if (seen.has(key)) return;
      seen.add(key);
      sent += 1;
      const digest = (reason as { digest?: unknown } | null)?.digest;
      send(
        JSON.stringify({
          kind,
          message: clean,
          stack: shortStack(stack),
          route: normalizeRoute(win?.location.pathname ?? "/"),
          version,
          platform: platform(),
          digest: typeof digest === "string" ? digest : null,
        }),
      );
    } catch {
      // Reporting must never become the next error.
    }
  }

  /** Listen for uncaught errors and rejections. Returns the cleanup. */
  function install() {
    if (!win) return () => {};
    const onError = (event: Event) => {
      const { error, message } = event as ErrorEvent;
      report(error ?? message ?? "Script error", "error");
    };
    const onRejection = (event: Event) => report((event as PromiseRejectionEvent).reason, "unhandledrejection");
    win.addEventListener("error", onError);
    win.addEventListener("unhandledrejection", onRejection);
    return () => {
      win.removeEventListener("error", onError);
      win.removeEventListener("unhandledrejection", onRejection);
    };
  }

  return { report, install };
}

let shared: ReturnType<typeof createClientReporter> | null = null;

function sharedReporter() {
  shared ??= createClientReporter();
  return shared;
}

/** Report one caught error, such as one an error boundary shows. */
export function reportClientError(error: unknown, kind: ReportKind) {
  sharedReporter().report(error, kind);
}

/** Start listening for uncaught errors on this page. */
export function installClientErrorReporting() {
  return sharedReporter().install();
}
