# Contributing

## Node.js 22

Use Node.js 22. `.nvmrc` is `22`, and `package.json` sets `"engines": { "node": ">=22 <23" }`.

```bash
nvm use
npm ci
```

Vercel reads `engines.node` and deploys the newest major that satisfies the range. `>=22 <23` selects Node 22.x. An open-ended range such as `>=22` selects Node 24.x on Vercel.

## Tests, lint, and build

```bash
npm test
npm run lint
npm run build
```

`npm test` runs `tsx --test "**/*.test.ts"`. The test runner discovers every `*.test.ts` file and skips `node_modules`. Add a test by adding a file; do not edit `package.json` to register it.

`npm run lint` is ESLint. The tree currently has a checked-in baseline of 32 errors and 13 warnings in `eslint-baseline.json`. CI runs `npm run lint:ci`, which fails only when the error count or the warning count goes above that baseline. Lower the baseline file when you fix existing issues.

`npm run build` does not need environment variables. Public Supabase and site URL values are optional at build time; the app keeps local-only behavior when they are unset. Do not put real secrets in CI.
