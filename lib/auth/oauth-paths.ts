/** Sign-in return paths. Tiny on purpose: first-run setup loads on every page. */

/** Where Supabase returns on the web: swaps the code for a session. */
export const OAUTH_PATH = "/auth/oauth";
/** Where Supabase returns in the iOS app: a universal link back into the app. */
export const APP_RETURN_PATH = "/auth/app-return";
/** A new Apple or Google account picks its @handle here first. */
export const HANDLE_PATH = "/settings/handle";
