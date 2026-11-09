# Make the Apple push key (do this first)

Do this on the Mac. Apple lets you download the key file **only once**, so the Mac is the safest place for it.

Takes about 10 minutes. You need your Apple Developer login.

## Part A: turn on Push for the app

1. Open **developer.apple.com** in Safari.
2. Click **Account** (top right) and sign in.
3. Click **Certificates, Identifiers & Profiles**.
4. In the left list, click **Identifiers**.
5. Click **app.slabhold**.
6. Scroll down the list of capabilities.
7. Tick the box next to **Push Notifications**.
8. Ignore the **Configure** button next to it. We use a key, not certificates.
9. Scroll to the top and click **Save**.
10. If it asks "Are you sure?", click **Confirm**.

## Part B: make the push key

1. In the left list, click **Keys**.
2. Click the blue **+** button.
3. In **Key Name**, type: `Slabhold Push`
4. Tick **Apple Push Notifications service (APNs)**.
5. Click **Configure** next to it.
6. For **Environment**, pick **Sandbox & Production**.
7. For **Key Restriction** (key type), pick **Team Scoped**.
8. Click **Save**.
9. Click **Continue**.
10. Click **Register**.
11. Click **Download**. A file called `AuthKey_XXXXXXXXXX.p8` lands in your Downloads folder.
12. This is the only download Apple allows. Keep the file safe. Never send it to anyone, and never paste it in a chat.
13. Write down the **Key ID**. It's the 10 letters and numbers after `AuthKey_` in the file name (it's also shown on the page).

Why a new key? The Sign in with Apple key (`N24YWJY4AD`) can't get push added later. Keeping them separate also means one can be replaced without breaking the other.

## Part C: put it in Vercel

1. Open the Downloads folder in Finder.
2. Right-click the `AuthKey_….p8` file, then **Open With** > **TextEdit**.
3. Press **Cmd + A** (select all), then **Cmd + C** (copy).
4. Open **vercel.com** and sign in.
5. Click the **Slabhold** project.
6. Click **Settings**, then **Environment Variables**.
7. Add these four, one at a time. For each one, tick **Production** only.

| Name | Value |
| --- | --- |
| `APNS_PRIVATE_KEY` | Paste (Cmd + V) the whole file text, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. Turn on **Sensitive**. |
| `APNS_KEY_ID` | The 10-character Key ID from Part B, step 13 |
| `APNS_TEAM_ID` | `Z45KCV676K` |
| `APNS_BUNDLE_ID` | `app.slabhold` |

8. Click **Save** after each one.
9. Close TextEdit **without saving** any changes.
10. Tell Lead: **"push key is in"**. The site needs a fresh deploy, because new settings only apply to a new deploy.
11. Move the `.p8` file somewhere safe. Not the Desktop, and not a shared iCloud folder. A USB stick in a drawer is fine.

Next: [MAC-REBUILD.md](MAC-REBUILD.md).
