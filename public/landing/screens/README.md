# Landing screens

Real iPhone screens of the current app, shown on the signed-out landing page.
Drop a file in with the exact name below and redeploy: the page shows it. A
missing file shows nothing (no stand-in, no broken box).

## Stills

| File | What it is |
| --- | --- |
| `home-for-you.png` | Home, For you, dark mode, two or three real posts visible |
| `home-post.png` | One Home post opened, card photo clear |
| `profile-cards.png` | A profile, with its row of cards that scrolls sideways |
| `scan-camera.png` | Scan tab, box guides on a real card, before the shutter |
| `scan-reveal.png` | The current typed / 3D scan reveal of that card |
| `card-sales.png` | The sold-price screen after the reveal, numbers correct |
| `scan-sales.png` | Older name for `card-sales.png`. Used only when that one is missing |
| `catalog-feed.png` | Catalog swipe feed, a card clear in frame |
| `collection-grid.png` | Collection first screen, cards-first grid in the app |
| `collection-value.png` | Collection value chart (and movers if they fit) |
| `leaderboard.png` | Weekly arena, This week |
| `invite.png` | An invite moment or the invite share sheet in the app |

## Clips

Six slots also play a short recording when an `.mp4` of the same name sits
beside the `.png`. The `.png` is then the clip's poster: it is what shows
before the clip plays, and all that shows with Reduce Motion on. An `.mp4`
with no `.png` shows nothing.

`home-for-you.mp4`, `scan-reveal.mp4`, `card-sales.mp4`, `catalog-feed.mp4`,
`profile-cards.mp4`, `collection-value.mp4`

`leaderboard` and `invite` are stills only.

A clip is 720 wide, portrait, dark mode, with no sound. It loads and plays
only once it scrolls into view, and pauses when it scrolls out.

## Rules for every screen

- Dark mode.
- The current app. No old app UI.
- A real iPhone screenshot or screen recording, with Do Not Disturb on.
- No casual table photos.
- Stills are PNG or WebP (a `.webp` with the same name works too).
- A still's long edge is at least 1170px. A clip's poster can match the clip.

The page reads each still's own size, so nothing shifts when it loads. Each
screen sits in a plain frame: rounded corners and a thin border.
