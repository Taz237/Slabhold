# iOS build 3: galaxy splash (Mac steps)

This build swaps the launch screen from the logo on plain black to a still galaxy (dark purple sky, faint stars, logo in the middle). It matches the animated galaxy on the landing page and /welcome, so the fade into the app shouldn't jump.

You need a Mac with Xcode. Nothing here is done from CI.

## 1. Get the code

Open Terminal and run these one line at a time:

```sh
cd ~/Slabhold
git pull
npm install
cd ios-app
npm install
npx cap sync ios
npx cap open ios
```

The last line opens the project in Xcode.

## 2. Check the build number

1. In Xcode's left sidebar, click the blue **App** project at the top.
2. Under **Targets**, click **App**.
3. Open the **General** tab and find **Identity**.
4. **Version** should say `1.0` and **Build** should say `3`. If Build isn't 3, type `3`.

## 3. Archive and upload

1. At the top of the Xcode window, set the device to **Any iOS Device (arm64)**.
2. In the menu bar, pick **Product > Archive**. Wait for it to finish (a few minutes).
3. The Organizer window opens. Select the new archive and click **Distribute App**.
4. Pick **App Store Connect**, then keep the defaults and click through to **Upload**.
5. When App Store Connect finishes processing build 3, install it from TestFlight.

## 4. Check it on the phone

1. Fully close the app (swipe it away), then open it.
2. You should see the galaxy splash: dark sky, a few faint stars, the purple logo in the middle.
3. Signed out, it fades into the live landing galaxy. Check there's no black flash between the two.

If the old black splash still shows, iOS may be caching it. Delete the app, restart the phone, and install build 3 again.

## What it should look like

![Galaxy splash on a 390pt iPhone](splash-390.webp)
