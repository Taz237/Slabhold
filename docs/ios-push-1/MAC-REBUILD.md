# Rebuild the iPhone app (build 4)

Build 4 has push notifications, a red number on the app icon for what's unread, the "Rate Slabhold" popup, the galaxy splash from #197, the App Store privacy file, and a tidier keyboard. One rebuild covers all of it.

The App Store version is now **1.0.1** (1.0 is already live, so Apple won't take a new build under 1.0).

## 1. Do the Apple key first

Do [APPLE-KEY.md](APPLE-KEY.md) first. Part A also turns on Push for app.slabhold, and the build can't sign without it.

## 2. Get the new code

Open **Terminal** on the Mac and paste this whole line, then press Return:

```
cd ~/Slabhold && git pull && npm install && cd ios-app && npm install && npx cap sync ios && npx cap open ios
```

Xcode opens when it's done.

## 3. Check three things in Xcode

1. In the left sidebar, open the **App** folder. You should see **PrivacyInfo.xcprivacy** in it.
   - In the same **App** folder you should also see **SlabholdNativePlugin.swift** and **SlabholdBridgeViewController.swift**. Those two make the popup and the icon number work.
2. Click the blue **App** project at the top of the sidebar, then the **App** target, then the **Signing & Capabilities** tab. You should see **Push Notifications** listed.
   - If there's a red signing error that mentions "aps-environment" or "Push Notifications", click **Try Again**. Automatic signing updates the profile by itself.
3. Click the **General** tab. Under **Identity**, **Version** should say **1.0.1** and **Build** should say **4**.

## 4. Upload

1. At the top of Xcode, pick **Any iOS Device (arm64)** as the device.
2. Menu bar: **Product** > **Archive**. Wait for it to finish (a few minutes).
3. The Organizer window opens. Click **Distribute App**.
4. Pick **App Store Connect**, then **Upload**. Click **Next** / **Upload** through the screens.
5. Wait for the email from Apple saying build 4 is ready in TestFlight (often 10 to 30 minutes).

Test push and the badge only from a **TestFlight** install, never from Xcode's ▶ Run. A Run build gets a test-only push token, and Apple's real push server turns it away.

## 5. Test it on your phone

1. Open **TestFlight** and install build 4.
2. Open Slabhold. The galaxy splash shows.
3. Sign in.
4. Like a post or follow someone.
5. A **Turn on notifications** card slides up. Tap **Turn on**, then **Allow**.
6. Go to **Settings** > **Notifications**. You should see **Notifications on this iPhone** switched on.
7. Tap **Send a test**. A banner arrives.
8. Tap the banner. The app opens the right page.
9. Close the app. Have a friend like your post. The Slabhold icon shows a red number.
10. Open the app and read your notifications. The red number goes away.

The Rate Slabhold popup never shows in TestFlight (Apple blocks it there). That's normal.

## 6. Send 1.0.1 to the App Store

Only after the push test above works.

1. Go to **App Store Connect** > **Apps** > **Slabhold**.
2. Next to **iOS App** on the left, click **+ Version** (or the **+**), and type `1.0.1`.
3. In **What's New in This Version**, paste the text from [WHATS-NEW.md](../build4-native-1/WHATS-NEW.md).
4. Scroll to **Build**, click **+**, and pick build **4**.
5. Click **Save**, then **Add for Review**, then **Submit for Review**.

## 7. If the card never shows

The Vercel `APNS_` settings aren't in yet, or the site hasn't been redeployed since they were added. Tell Lead.
