import { installDom } from "./dom";

/**
 * installDom at import time. Import this before react-dom, so React sees a
 * DOM when it loads and wires real input events (onChange on typing).
 */
export const dom = installDom();
