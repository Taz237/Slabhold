"use client";

import Link from "next/link";
import { useState } from "react";
import { ENABLED_PROVIDERS, OAUTH_FAILED, type OAuthProvider } from "@/lib/auth/oauth";
import { isNativeApp } from "@/lib/ios/platform";

const base =
  "flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-[17px] font-medium transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] focus-visible:outline-none";

const BUTTONS: Record<OAuthProvider, { label: string; className: string; icon: React.ReactNode }> = {
  // Apple's white style: white, black logo and text, a light gray hairline.
  apple: {
    label: "Continue with Apple",
    className: `${base} border border-zinc-200 bg-white text-black`,
    icon: (
      <svg aria-hidden viewBox="0 0 24 24" className="-mt-0.5 h-5 w-5" fill="currentColor">
        <path d="M16.37 1.43c0 1.14-.5 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.2-2.98.81-.94 2.15-1.64 3.25-1.68.03.13.06.28.06.43Zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8C4.97 18.38 3.93 15.57 3.93 12.92c0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.68.95 3.6.95.87 0 2.22-1.01 3.9-1.01.62 0 2.89.06 4.38 2.19-.13.09-2.39 1.37-2.39 4.19 0 3.26 2.86 4.42 2.96 4.45Z" />
      </svg>
    ),
  },
  // Google's light style: white, gray hairline, the four-color G.
  google: {
    label: "Continue with Google",
    className: `${base} border border-[#747775] bg-white text-[#1F1F1F]`,
    icon: (
      <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19Z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
      </svg>
    ),
  },
};

/**
 * Continue with Apple / Google, then an "or" above the email form. Renders
 * nothing when neither flag is on.
 */
export function SocialSignIn({
  providers = ENABLED_PROVIDERS,
  next,
  failed,
}: {
  /** Defaults to the NEXT_PUBLIC_AUTH_APPLE / _GOOGLE flags. */
  providers?: readonly OAuthProvider[];
  next: string;
  failed: boolean;
}) {
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState(failed);
  if (providers.length === 0) return null;

  async function go(provider: OAuthProvider) {
    setBusy(provider);
    setError(false);
    const ok = await import("@/lib/auth/oauth-start")
      .then((mod) => mod.startOAuth(provider, next))
      .catch(() => false);
    if (!ok) setError(true);
    // On the web the page is leaving, so the button stays busy. In the app the sheet is up.
    if (!ok || isNativeApp()) setBusy(null);
  }

  return (
    <div className="mt-6">
      <div className="space-y-3">
        {providers.map((provider) => {
          const button = BUTTONS[provider];
          return (
            <button
              key={provider}
              type="button"
              disabled={busy !== null}
              onClick={() => void go(provider)}
              className={button.className}
            >
              {button.icon}
              {button.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">
          {OAUTH_FAILED}
        </p>
      ) : null}
      <p className="mt-3 text-center text-xs leading-5 text-zinc-500">
        New here? Continuing confirms you&apos;re 13 or older and agree to the{" "}
        <Link href="/terms" className="font-semibold underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-semibold underline">
          Privacy
        </Link>
        .
      </p>
      <div className="mt-5 flex items-center gap-3 text-sm text-zinc-500" role="separator" aria-label="or">
        <span aria-hidden className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
        <span aria-hidden>or</span>
        <span aria-hidden className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
      </div>
    </div>
  );
}
