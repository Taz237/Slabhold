import { createRequire } from "node:module";

/**
 * Client components import server actions, which import "server-only". Next
 * swaps those for references at build time; tests load them directly, so the
 * guard is stubbed. Import this before any component under test.
 */
const require = createRequire(import.meta.url);
const path = require.resolve("server-only");
require.cache[path] = { id: path, filename: path, loaded: true, exports: {} } as NodeJS.Module;
