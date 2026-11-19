/**
 * The Spotlight carousel's own CSS: keyframes and scroll timelines can't be
 * written as utility classes. The component draws it once in a hoisted
 * <style> (React dedupes by href), so the profile's shared stylesheet stays
 * as it is.
 *
 * Numbers match lib/profile/spotlight.ts: scale 1 to 0.78, veil 0 to 0.45,
 * blur 0 to 3px, on a quad ease-out of the distance to center. Each half of a
 * keyframe is that curve as a cubic-bezier (ease-in coming toward center,
 * ease-out going away).
 *
 * Two engines draw the same look:
 *  - `animation-timeline` (Chrome, Safari 26): each slide is its own view
 *    timeline, so the browser moves the cards with the scroll and no script
 *    runs per frame.
 *  - older WebKit: the component writes one custom property, --spot-a, on the
 *    few visible slides from a single passive scroll listener. This engine
 *    has no blur: a blur driven from script re-rasters on the main thread
 *    and halved the frame rate under a 4x CPU slowdown, so it leans on
 *    scale and dim alone.
 * Only transforms, opacity and (on at most the two neighbours in view, and
 * only on the scroll-timeline engine) a small blur ever animate.
 */
export const SPOTLIGHT_CSS = `
@property --spot-tint {
  syntax: "<color>";
  inherits: true;
  initial-value: #7c3aed;
}
.spot-root {
  --spot-w: min(62vw, 248px);
  --spot-h: calc(var(--spot-w) * 1.4);
  --spot-glow: 0.42;
  --spot-lift: 0.3;
  min-height: calc(var(--spot-h) + 32px);
}
@media (prefers-color-scheme: dark) {
  .spot-root {
    --spot-glow: 0.62;
    --spot-lift: 0.7;
  }
}
.spot-row {
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  touch-action: pan-x pan-y;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.spot-row::-webkit-scrollbar {
  display: none;
}
.spot-edge {
  flex: none;
  width: calc(50% - var(--spot-w) / 2);
}
.spot-slide {
  position: relative;
  flex: none;
  width: var(--spot-w);
  height: var(--spot-h);
  scroll-snap-align: center;
  scroll-snap-stop: normal;
  view-timeline: --spot inline;
}
.spot-slide + .spot-slide {
  margin-left: -12px;
}
.spot-far {
  content-visibility: auto;
  contain-intrinsic-size: var(--spot-w) var(--spot-h);
}
.spot-far::before {
  content: "";
  position: absolute;
  inset: 11%;
  border-radius: 12px;
  background: rgba(127, 127, 127, 0.14);
}
.spot-veil {
  background: var(--background);
  opacity: 0;
}
.spot-lift {
  position: absolute;
  inset: 6% 4% 0;
  border-radius: 16px;
  box-shadow: 0 12px 20px -12px rgba(0, 0, 0, var(--spot-lift));
  opacity: 1;
  pointer-events: none;
}
.spot-glow {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--spot-w) * 1.9);
  height: calc(var(--spot-h) * 1.04);
  margin: calc(var(--spot-h) * -0.52) 0 0 calc(var(--spot-w) * -0.95);
  opacity: var(--spot-glow);
  transition: --spot-tint 600ms ease;
  background:
    radial-gradient(40% 40% at 32% 44%, var(--spot-tint) 0%, transparent 100%),
    radial-gradient(40% 38% at 70% 58%, #5b21b6 0%, transparent 100%),
    radial-gradient(48% 46% at 50% 50%, rgba(167, 139, 250, 0.5) 0%, transparent 100%);
}
.spot-label {
  background: rgba(9, 9, 11, 0.62);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 140ms ease, transform 140ms ease;
}
.spot-label[data-on] {
  opacity: 1;
  transform: none;
  transition-duration: 220ms;
}
@starting-style {
  .spot-label[data-on] {
    opacity: 0;
    transform: translateY(4px);
  }
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .spot-label {
    background: #18181b;
  }
}
@media (prefers-reduced-transparency: reduce) {
  .spot-label {
    background: #18181b;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
@keyframes spot-scale {
  0% { transform: scale(0.78); animation-timing-function: cubic-bezier(0.11, 0, 0.5, 0); }
  50% { transform: scale(1); animation-timing-function: cubic-bezier(0.5, 1, 0.89, 1); }
  100% { transform: scale(0.78); }
}
@keyframes spot-veil {
  0% { opacity: 0.45; animation-timing-function: cubic-bezier(0.11, 0, 0.5, 0); }
  50% { opacity: 0; animation-timing-function: cubic-bezier(0.5, 1, 0.89, 1); }
  100% { opacity: 0.45; }
}
@keyframes spot-blur {
  0% { filter: blur(3px); animation-timing-function: cubic-bezier(0.11, 0, 0.5, 0); }
  50% { filter: blur(0px); animation-timing-function: cubic-bezier(0.5, 1, 0.89, 1); }
  100% { filter: blur(3px); }
}
@keyframes spot-lift {
  0% { opacity: 0; animation-timing-function: cubic-bezier(0.11, 0, 0.5, 0); }
  50% { opacity: 1; animation-timing-function: cubic-bezier(0.5, 1, 0.89, 1); }
  100% { opacity: 0; }
}
@keyframes spot-drift {
  from { transform: rotate(-8deg) scale(1); }
  to { transform: rotate(8deg) scale(1.08) translate3d(2%, -2%, 0); }
}
@keyframes spot-enter {
  from { opacity: 0; transform: translate3d(12px, 0, 0); }
  to { opacity: 1; transform: none; }
}
@keyframes spot-nudge {
  0%, 100% { transform: none; }
  45% { transform: translate3d(-24px, 0, 0); }
}
@media (prefers-reduced-motion: no-preference) {
  .spot-fx.spot-enter {
    animation: spot-enter 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .spot-fx.spot-nudge .spot-live {
    animation: spot-nudge 720ms cubic-bezier(0.3, 0, 0.2, 1) 420ms 1 both;
  }
  .spot-fx .spot-glow {
    will-change: transform;
    animation: spot-drift 10s ease-in-out infinite alternate;
  }
  @supports (animation-timeline: view()) {
    .spot-fx .spot-scale {
      animation: spot-scale linear both;
      animation-timeline: --spot;
    }
    .spot-fx .spot-veil {
      animation: spot-veil linear both;
      animation-timeline: --spot;
    }
    .spot-fx .spot-blur {
      animation: spot-blur linear both;
      animation-timeline: --spot;
    }
    .spot-fx .spot-lift {
      animation: spot-lift linear both;
      animation-timeline: --spot;
    }
  }
  @supports not (animation-timeline: view()) {
    .spot-fx .spot-scale {
      transform: scale(calc(1 - 0.22 * var(--spot-a, 1)));
    }
    .spot-fx .spot-veil {
      opacity: calc(0.45 * var(--spot-a, 1));
    }
    .spot-fx .spot-lift {
      opacity: calc(1 - var(--spot-a, 1));
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  .spot-label {
    transform: none;
    transition: none;
  }
  .spot-slide + .spot-slide {
    margin-left: 12px;
  }
}
`;
