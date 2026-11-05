# ios-shell-1: steps on the Mac

What's left for ios-shell-1 that needs Xcode. The cloud session that built the
PR runs on Linux, so it couldn't build the app, take simulator screenshots or
test Turnstile in WKWebView. None of these steps sign, archive or upload
anything.

Setup: Node 26.13.0, Xcode 27.2 (iOS 27.2 simulator), team Z45KCV676K.

## 1. Build and run

```sh
git fetch origin
git checkout claude/ios-shell-1-z17g4u
cd ios-app
npm ci
npx cap sync ios        # copies the config and resolves the Swift packages
npx cap open ios        # opens ios/App/App.xcodeproj in Xcode
```

In Xcode, open the App target, then **Signing & Capabilities**:

- Team is **Z45KCV676K** and "Automatically manage signing" is on.
- **Associated Domains** lists `applinks:slabhold.app` and
  `webcredentials:slabhold.app`. If Xcode says the App ID doesn't have the
  capability yet, let automatic signing add it (Try Again). Don't change the
  team or the bundle id (`app.slabhold`).

Pick an iPhone simulator on iOS 27.2 and press Run.

The app loads https://slabhold.app, so the web half of this PR only shows up
once it's deployed. To test before merging, you can point `server.url` in
`ios-app/capacitor.config.json` at this branch's Vercel preview URL, run
`npx cap sync ios`, and **don't commit that change**. Universal links only
work against production (the AASA file must be live on slabhold.app).

## 2. Check list

| # | Check | How | Expected |
|---|---|---|---|
| 1 | Splash | Cold launch | Purple tile on #09090B, then the page. No white flash. |
| 2 | Safe areas | Home, a post, the composer, the side menu | Nothing under the notch or the home indicator. |
| 3 | Status bar | Switch light and dark (`xcrun simctl ui booted appearance dark`) | Dark text in light mode, light text in dark mode. |
| 4 | Share | Share on a post, a card and a badge | The native iOS share sheet. Cancel does nothing. |
| 5 | Haptics | Like a post, publish a post | Light tap on Like, success buzz on post. **Device only**: the simulator has no haptics. |
| 6 | Add card photo | Add card > Choose from library | Native photo picker; the photo fills the card slot. |
| 7 | Add card camera | Add card > Take photo | Camera permission prompt, then the camera. **Device only**: the simulator has no camera. |
| 8 | External links | Share > Post on X, or any link to another site | Opens in the in-app browser (Done button), not Safari. |
| 9 | Universal links | `xcrun simctl openurl booted https://slabhold.app/u/slabholdupdates` | Opens that page in the app. |
| 10 | No install copy | Side menu, onboarding, Settings > Notifications | No "Add to Home Screen" anywhere. Notifications says "not available yet". |
| 11 | Offline | Turn off the Mac's network, cold launch | "Can't reach Slabhold" with Try again. |
| 12 | Signed out | Log out | Goes to Log in, not the landing page. |

AASA check, after deploy:

```sh
curl -sI https://slabhold.app/.well-known/apple-app-site-association   # 200, content-type: application/json
curl -s https://app-site-association.cdn-apple.com/a/v1/slabhold.app   # Apple's cached copy, can lag a few hours
```

## 3. Turnstile in WKWebView

Fill in the PR's Turnstile table (Pass/Fail, and what you saw):

- Sign up
- Log in
- Forgot password
- Each of the three in dark mode

If the widget fails to load, note the error. Capacitor only sends top-level
navigations to other hosts out to Safari, so the challenges.cloudflare.com
iframe should load in place.

## 4. Screenshots

Sign in with the demo account. iOS 27.2 simulator, iPhone at 390pt wide
(iPhone 17 Pro or similar). For each screen take light and dark:

```sh
xcrun simctl ui booted appearance light   # or dark
xcrun simctl io booted screenshot docs/ios-shell-1/screenshots/<name>-<light|dark>.png
```

| Name | Screen |
|---|---|
| `splash` | Launch splash (cold launch, grab it fast) |
| `home` | Home feed, signed in |
| `share-sheet` | Native share sheet open on a post |
| `add-card-photo` | Add card with the photo picker open |
| `in-app-browser` | An external link open in the in-app browser |
| `side-menu` | Side menu (no Add to Home Screen) |
| `offline` | The offline page |

Commit them to `docs/ios-shell-1/screenshots/` on the PR branch, then swap the
placeholders in the PR body for
`https://github.com/Taz237/Slabhold/blob/<sha>/docs/ios-shell-1/screenshots/<file>?raw=true`.

## 5. Not in this task

- Push notifications (ios-push-1).
- Archive, TestFlight, App Store Connect, review notes.
