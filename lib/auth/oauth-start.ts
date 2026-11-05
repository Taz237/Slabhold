import { oauthRedirectTo, type OAuthProvider } from "@/lib/auth/oauth";
import { isNativeApp, loadNative } from "@/lib/ios/platform";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";

/**
 * Opens Apple or Google. Web: a normal redirect. iOS app: the in-app browser.
 * Its own chunk, loaded on tap, so the login screen stays light.
 */
export async function startOAuth(provider: OAuthProvider, next: string): Promise<boolean> {
  const supabase = await loadSupabaseBrowser();
  if (!supabase) return false;
  const native = isNativeApp();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: oauthRedirectTo(window.location.origin, next, native), skipBrowserRedirect: native },
  });
  if (error) return false;
  if (native) {
    if (!data.url) return false;
    await (await loadNative()).openAuthBrowser(data.url);
  }
  return true;
}
