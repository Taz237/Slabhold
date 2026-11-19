import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { SHEET_SETTLE_MS } from "@/lib/ui/sheet-drag";
import { useSheetDrag } from "@/lib/ui/use-sheet-drag";

const { win } = installDom();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function Sheet({ onClose }: { onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useSheetDrag(panelRef, rootRef, onClose);
  return (
    <div ref={rootRef}>
      <div ref={panelRef} id="panel">
        <div id="list">
          <p id="row">Row</p>
        </div>
      </div>
    </div>
  );
}

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

/** Mounts the sheet. `scrolled` is how far its inner list has scrolled. */
async function mount(scrolled: number, onClose: () => void = () => {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Sheet onClose={onClose} />));
  const panel = document.getElementById("panel")!;
  const list = document.getElementById("list")!;
  const row = document.getElementById("row")!;
  const reads = { scrollTop: 0 };
  Object.defineProperty(panel, "offsetHeight", { configurable: true, value: 400 });
  Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1200 });
  Object.defineProperty(list, "clientHeight", { configurable: true, value: 300 });
  Object.defineProperty(list, "scrollTop", {
    configurable: true,
    get() {
      reads.scrollTop += 1;
      return scrolled;
    },
  });
  // Count the touchmove listeners the hook holds on the sheet.
  const moves = { live: 0, added: 0, passive: [] as unknown[] };
  const add = panel.addEventListener.bind(panel);
  const remove = panel.removeEventListener.bind(panel);
  panel.addEventListener = ((type: string, listener: EventListener, options?: AddEventListenerOptions) => {
    if (type === "touchmove") {
      moves.live += 1;
      moves.added += 1;
      moves.passive.push(options?.passive);
    }
    add(type, listener, options);
  }) as typeof panel.addEventListener;
  panel.removeEventListener = ((type: string, listener: EventListener) => {
    if (type === "touchmove" && moves.live > 0) moves.live -= 1;
    remove(type, listener);
  }) as typeof panel.removeEventListener;
  return { panel, row, reads, moves };
}

/** A slow finger: each event is 300ms after the last, so nothing here reads as a flick. */
let clock = 0;

function touch(target: HTMLElement, type: string, x: number, y: number) {
  const event = new win.Event(type, { bubbles: true, cancelable: true });
  const touches = type === "touchend" ? [] : [{ clientX: x, clientY: y }];
  Object.defineProperty(event, "touches", { value: touches });
  clock += 300;
  Object.defineProperty(event, "timeStamp", { value: clock });
  target.dispatchEvent(event);
  return event;
}

describe("useSheetDrag", () => {
  it("leaves a scrolled list alone: no touchmove listener, and the sheet never moves", async () => {
    const { panel, row, moves } = await mount(120);
    touch(row, "touchstart", 100, 300);
    assert.equal(moves.added, 0, "nothing watches the moves while the list is scrolled");
    const move = touch(row, "touchmove", 100, 500);
    assert.equal(move.defaultPrevented, false, "the list keeps its scroll");
    await wait(30);
    assert.equal(panel.style.transform, "");
    touch(row, "touchend", 100, 500);
    assert.equal(panel.style.transform, "");
  });

  it("measures the scroll once, at touchstart, not on every move", async () => {
    const { row, reads, moves } = await mount(0);
    touch(row, "touchstart", 100, 300);
    assert.equal(moves.added, 1);
    assert.deepEqual(moves.passive, [false], "it can stop the page scrolling under the drag");
    const atStart = reads.scrollTop;
    for (let y = 302; y <= 330; y += 4) touch(row, "touchmove", 100, y);
    assert.equal(reads.scrollTop, atStart, "no re-measure while the finger moves");
    touch(row, "touchend", 100, 330);
    assert.equal(moves.live, 0, "the listener is gone when the finger lifts");
  });

  it("still pulls down to close from the top", async () => {
    let closed = 0;
    const { panel, row } = await mount(0, () => (closed += 1));
    touch(row, "touchstart", 100, 100);
    const first = touch(row, "touchmove", 100, 120);
    assert.equal(first.defaultPrevented, true, "the drag is the sheet's");
    touch(row, "touchmove", 100, 300);
    await wait(40);
    assert.equal(panel.style.transform, "translate3d(0, 200px, 0)", "the sheet follows the finger");
    touch(row, "touchend", 100, 300);
    assert.equal(closed, 0, "it slides away first");
    await wait(SHEET_SETTLE_MS + 60);
    assert.equal(closed, 1);
  });

  it("settles back after a short pull, and a sideways move is never claimed", async () => {
    let closed = 0;
    const { panel, row, moves } = await mount(0, () => (closed += 1));
    touch(row, "touchstart", 100, 100);
    touch(row, "touchmove", 100, 140);
    await wait(40);
    touch(row, "touchend", 100, 140);
    assert.equal(panel.style.transform, "translate3d(0, 0, 0)");
    touch(row, "touchstart", 100, 100);
    const sideways = touch(row, "touchmove", 160, 104);
    assert.equal(sideways.defaultPrevented, false);
    assert.equal(moves.live, 0, "released, so it stops watching");
    await wait(SHEET_SETTLE_MS + 60);
    assert.equal(closed, 0);
  });
});
