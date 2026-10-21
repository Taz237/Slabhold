/** Canonical origin. Preview deploys opt out via publicOrigin. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://slabhold.app").replace(/\/$/, "");

type SiteEnv = {
  VERCEL_ENV?: string;
  NEXT_PUBLIC_VERCEL_ENV?: string;
  NEXT_PUBLIC_SITE_URL?: string;
};

function siteEnv(env?: SiteEnv): SiteEnv {
  return (
    env ?? {
      VERCEL_ENV: process.env.VERCEL_ENV,
      NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    }
  );
}

export function isPreviewDeployment(env?: SiteEnv): boolean {
  const source = siteEnv(env);
  return source.VERCEL_ENV === "preview" || source.NEXT_PUBLIC_VERCEL_ENV === "preview";
}

/** Same rule as SITE_URL, with an explicit override for tests. */
export function siteUrlFrom(value: string | undefined): string {
  return (value || "https://slabhold.app").replace(/\/$/, "");
}

/**
 * Share links and auth redirects.
 * Preview deployments keep the browser origin so the preview host still works.
 * Production and local use SITE_URL.
 */
export function publicOrigin(browserOrigin?: string | null, env?: SiteEnv): string {
  const source = siteEnv(env);
  if (isPreviewDeployment(source)) {
    const origin = (browserOrigin ?? "").trim().replace(/\/$/, "");
    if (origin) return origin;
  }
  return siteUrlFrom(source.NEXT_PUBLIC_SITE_URL);
}
