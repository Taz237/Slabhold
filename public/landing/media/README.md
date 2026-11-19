# Landing media slots

Signed-out Home shows real media only: real card photos and real recordings
of the app. Each slot below is one file with an exact name in this folder.
`lib/landing/media.ts` checks which files exist when the page is built or
rendered. A slot with no file shows no media (the section is text only, or
hidden where marked). Nothing generated or placeholder ever stands in.

To fill a slot: copy the file here with the exact name, commit, redeploy.
No code changes.

## Slots

| Slot | File(s) | What it is | Empty means |
| --- | --- | --- | --- |
| H1 hero card | `hero-card.avif` | A real numbered card, straight on, edges in frame | The first real card from the team collection, or an empty glass slab |
| H1 hero card back | `hero-card-back.avif` | The back of the same card. Optional. Kept for later, not drawn yet | Nothing |
| S1 scan | `scan.mp4` + `scan.webp` | The 1.2.0 scan: crop, straighten, sweep, reveal | Text only |
| S2 edge serial | `serial.mp4` + `serial.webp` | The in-app edge serial read | Hidden when S2 and S3 are both empty |
| S3 serial macro | `serial-macro.avif` | A macro photo of the card's foil edge serial | Hidden when S2 and S3 are both empty |
| S4 parallels | `parallels.mp4` + `parallels.webp` | The "Pick your version" list and one tap | Text only |
| S5 collection | `collection.mp4` + `collection.webp` | Cards-first Collection, a chart scrub, a movers swipe | A grid of real team-collection cards, or text only |
| S6 arena | `arena.mp4` + `arena.webp` | The purple arena leaderboard | Text only |
| S6 share rank | `share-rank.webp` | One share-rank image | Not drawn |
| S7 pulls | `pulls.json` | Approved public pulls | Section not rendered |

A clip needs both its `.mp4` and its `.webp` poster. One without the other
counts as empty.

## `pulls.json`

```json
[{ "handle": "collector_handle", "cardId": "public-card-uuid" }]
```

Only pulls the collector has approved. The card must be public and belong to
that handle. Anything else is skipped. Photos are read through the same
public reads the app uses.

## `sizes.json` (optional)

Defaults: clips 720x1560, stills 1280x1792. If a file has another shape,
list it so the page holds the right space and nothing shifts:

```json
{
  "scan.mp4": { "width": 720, "height": 1560 },
  "hero-card.avif": { "width": 1280, "height": 1792, "alt": "What the card is", "serial": "06/10" }
}
```

`alt` and `serial` on `hero-card.avif` are optional. `serial` must be the
serial printed on that card. It is drawn as a small glass shard beside the
slab. Leave it out and no shard appears.

## Encoding

Clips: H.264, yuv420p, 720 wide, 30 fps, no audio, 1.5 MB or less.

```sh
ffmpeg -i in.mov -vf "scale=720:-2,fps=30" -c:v libx264 -pix_fmt yuv420p \
  -crf 28 -preset slow -movflags +faststart -an scan.mp4
```

Raise `-crf` toward 30 if a clip is over 1.5 MB.

Posters: the clip's first frame, WebP, quality 70, 540 wide, 40 KB or less.

```sh
ffmpeg -i scan.mp4 -frames:v 1 -vf "scale=540:-2" -c:v libwebp -quality 70 scan.webp
```

Stills: AVIF, 1280 wide (the page serves 640 and 1280 from it).

```sh
ffmpeg -i in.jpg -vf "scale=1280:-2" -c:v libaom-av1 -still-picture 1 -crf 30 hero-card.avif
```

`share-rank.webp`: WebP, quality 80, 1080 wide.

```sh
ffmpeg -i in.png -vf "scale=1080:-2" -c:v libwebp -quality 80 share-rank.webp
```

## Rules

- Real only. No generated, placeholder or fixture cards, and no mockups.
- No team, league or maker logos added on top of a photo.
- No real user's name, handle or avatar outside `pulls.json`.
- No prices, values or counts burned into a clip that aren't real.

## After adding files

1. `ls -la` and check every clip is 1.5 MB or less and every poster 40 KB or less.
2. Redeploy.
3. Open `/` signed out: each filled section shows its media.
4. Run Lighthouse (mobile) on `/` and compare with the last PR's numbers.
