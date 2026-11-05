# ios-shell-1 screenshots

iOS 27.2 simulator, iPhone at 390pt wide, signed in with demo data. Take each
screen in light and dark:

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
| `notifications` | Settings > Notifications ("not on in the iPhone app yet") |
| `offline` | The offline page |

The cloud session that built this PR runs on Linux with no Xcode, so this
folder starts empty. `../offline-page/` has Chromium renders of the bundled
offline page at 390px. Those are not simulator shots.
