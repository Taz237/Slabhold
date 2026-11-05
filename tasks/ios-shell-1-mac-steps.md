# Run Slabhold on your iPhone (after ios-shell-1 merges)

One thing per step. If a step shows red errors, stop and send a screenshot.

**Before you start:** your Mac has Node 26, git and Xcode 27.2. Open Xcode once so it finishes installing.

## Get the code
1. Open **Terminal** (press Cmd+Space, type Terminal, press Return).
2. Go to your projects folder: type `cd ~` and press Return.
3. **Haven't got Slabhold on this Mac yet?** Type `git clone https://github.com/Taz237/Slabhold.git` and press Return. **Already have it?** Skip this step.
4. Go into the folder: `cd Slabhold`
5. Switch to main: `git checkout main`
6. Get the newest code: `git pull`

## Install
7. Install the website's parts: `npm install` (takes a minute; yellow "warn" lines are OK).
8. Go into the app folder: `cd ios-app`
9. Install the app's parts: `npm install`
10. Copy everything into the iPhone project: `npx cap sync ios` (it should end without red errors).
11. Open it in Xcode: `npx cap open ios`

## Signing (one time)
12. In Xcode's left sidebar, click the blue **App** icon at the top.
13. In the middle, under **Targets**, click **App**.
14. Click the **Signing & Capabilities** tab.
15. Make sure **Automatically manage signing** is checked.
16. Set **Team** to **DONALD NICHOLAS TAZIOLE**. (If it isn't listed: Xcode → Settings → Accounts → + → sign in with your Apple ID, then come back.)
17. Check **Bundle Identifier** says `app.slabhold`. No red errors should show here.

## Your iPhone (one time)
18. Plug your iPhone into the Mac with a cable.
19. Unlock the iPhone. When it asks **Trust This Computer?**, tap **Trust** and enter your passcode.
20. On the iPhone, open **Settings → Privacy & Security**.
21. Scroll to the bottom and tap **Developer Mode**. (If it's missing, do step 23 once first, then come back.)
22. Turn it on, tap **Restart**, and after it restarts tap **Turn On** and enter your passcode.

## Run it
23. At the top of Xcode, click the device menu (next to "App") and pick **your iPhone**.
24. Press the **▶ Run** button (or Cmd+R).
25. If the iPhone says **Untrusted Developer**: open **Settings → General → VPN & Device Management**, tap your developer name, tap **Trust**.
26. Press **▶ Run** again. Slabhold opens on your phone.

## Next time
27. In Terminal: `cd ~/Slabhold && git pull && npm install && cd ios-app && npm install && npx cap sync ios && npx cap open ios`, then press **▶ Run**.
