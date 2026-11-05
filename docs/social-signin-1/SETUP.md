# Continue with Apple / Google: setup

The buttons are already in the app, but hidden. They show up once you do the
steps below and turn on two Vercel flags. Until then nothing changes for anyone.

You'll need:

- Your Supabase project ID. It's the first part of your Supabase URL:
  `https://<project>.supabase.co`. Below, swap `<project>` for it.
- Access to the Apple Developer account (team `Z45KCV676K`).
- A Google account that can use Google Cloud.

Never paste a key, secret or `.p8` file into GitHub, Slack or chat. They only go
into the Supabase dashboard.

---

## 0. Supabase: allow the return pages

Supabase only sends people back to pages on its allow list.

1. Supabase dashboard > your project > **Authentication** > **URL Configuration**.
2. Under **Redirect URLs**, click **Add URL** and add each of these:
   - `https://slabhold.app/auth/oauth`
   - `https://slabhold.app/auth/app-return`
   - `https://slabhold.vercel.app/auth/oauth`
3. Save.

(If `https://slabhold.app/**` is already in the list, these are covered.)

Also, from the same dashboard, keep this handy. You'll paste it into Apple and Google:

```
https://<project>.supabase.co/auth/v1/callback
```

That's the "callback URL". Supabase shows it too, inside each provider's settings.

---

## 1. Apple

Go to https://developer.apple.com/account > **Certificates, Identifiers & Profiles**.

### 1a. Turn on Sign in with Apple for the app

1. **Identifiers** > click **app.slabhold** (the App ID).
2. Tick **Sign in with Apple**. Leave it as "Enable as a primary App ID".
3. Click **Save**, then **Confirm**.

### 1b. Make a Services ID (this is the "client ID" for the web)

1. **Identifiers** > the **+** button > choose **Services IDs** > Continue.
2. Description: `Slabhold web sign-in`. Identifier: `app.slabhold.web`.
3. Continue > Register.
4. Click the new `app.slabhold.web` > tick **Sign in with Apple** > **Configure**.
5. Primary App ID: **app.slabhold**.
6. **Domains and Subdomains**: `<project>.supabase.co`
7. **Return URLs**: `https://<project>.supabase.co/auth/v1/callback`
8. Next > Done > Continue > **Save**.

### 1c. Make the Sign in with Apple key (.p8)

1. **Keys** > the **+** button.
2. Name: `Slabhold Sign in with Apple`. Tick **Sign in with Apple** > **Configure**
   > Primary App ID: **app.slabhold** > Save.
3. Continue > Register > **Download**. You get a file like `AuthKey_ABC123XYZ.p8`.
   You can only download it once, so keep it somewhere safe (a password manager, not the repo).
4. Write down the **Key ID** (the `ABC123XYZ` part) and your **Team ID** (`Z45KCV676K`, top right).

### 1d. Paste it into Supabase

1. Supabase > **Authentication** > **Sign In / Providers** > **Apple** > turn it on.
2. **Client IDs**: `app.slabhold.web,app.slabhold` (the Services ID, then the app's bundle ID).
3. **Secret Key (for OAuth)**: Supabase needs a signed secret made from the .p8 file.
   Supabase's "Login with Apple" docs page (https://supabase.com/docs/guides/auth/social-login/auth-apple)
   has a secret generator. It runs in your browser. Enter the Team ID, Key ID, Services ID (`app.slabhold.web`) and the contents of the `.p8` file,
   and paste the result here.
4. Save.

Heads-up: Apple's secret expires after 6 months. Put a reminder in your calendar
to make a new one (repeat step 3) before then, or Apple sign-in stops working.

---

## 2. Google

1. Go to https://console.cloud.google.com and pick (or create) a project called `Slabhold`.
2. **APIs & Services** > **OAuth consent screen** (Google may call it "Google Auth Platform" > **Branding**):
   - App name: `Slabhold`. Support email: the Slabhold Gmail.
   - Logo: `public/icons/` purple star (optional).
   - App domain / home page: `https://slabhold.app`, privacy `https://slabhold.app/privacy`,
     terms `https://slabhold.app/terms`.
   - Authorized domain: `slabhold.app` and `supabase.co`.
   - Scopes: just the defaults (`email`, `profile`, `openid`).
   - Audience: **External**, then **Publish app** so anyone can sign in (not just test users).
3. **APIs & Services** > **Credentials** > **Create credentials** > **OAuth client ID**.
   - Application type: **Web application**. Name: `Slabhold web`.
   - **Authorized JavaScript origins**: `https://slabhold.app`
   - **Authorized redirect URIs**: `https://<project>.supabase.co/auth/v1/callback`
   - Create. Google shows a **Client ID** and **Client secret**.
4. Supabase > **Authentication** > **Sign In / Providers** > **Google** > turn it on.
   Paste the **Client ID** and **Client secret**. Save.

---

## 3. Vercel: turn the buttons on

1. Vercel > the Slabhold project > **Settings** > **Environment Variables**.
2. Add, for **Production** (and Preview if you want to test there first):
   - `NEXT_PUBLIC_AUTH_APPLE` = `1`
   - `NEXT_PUBLIC_AUTH_GOOGLE` = `1`
3. These are read when the site is built, so redeploy: **Deployments** > the latest
   one > **⋯** > **Redeploy**.

You can turn one on without the other. To hide a button again, delete its
variable (or set it to `0`) and redeploy.

---

## 4. iOS app

The app now opens Apple and Google sign-in in the in-app browser and comes back
on `https://slabhold.app/auth/app-return`. On the Mac:

```
cd ios-app
npx cap sync ios
```

Then build and run from Xcode as usual. The app's universal-link file
(`/.well-known/apple-app-site-association`) is served by the website, so the
new return path works once the site is deployed. iOS can cache that file for a
while; deleting and reinstalling the app makes it fetch a fresh copy.

---

## 5. Check it

1. Open https://slabhold.app/login in a private window. You should see
   "Continue with Apple", "Continue with Google", "or", then the email form.
2. Try each. A brand-new account lands on **Pick your handle**, then the usual first-run setup.
3. Log out, log in again with the same button: you go straight in.
4. In the iOS app, do the same. The sign-in sheet should close by itself and you're logged in.

If a button says "That sign-in didn't finish", check that the Redirect URLs in
step 0 and the callback URL in Apple/Google match exactly.
