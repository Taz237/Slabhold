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

`npm run lint` is ESLint. CI runs `npm run lint:ci`, which compares each `severity file:rule` entry in `eslint-baseline.json`. Line and column are ignored. The check fails when an entry's count rises or a new entry appears. The checked-in baseline is 32 errors and 13 warnings. ESLint runs with `--report-unused-disable-directives` because that flag does not change those counts.

When findings disappear, `npm run lint:ci` stays green and prints `lower the baseline: run npm run lint:baseline`. That command rewrites `eslint-baseline.json` from the current tree. Commit the updated file.

`npm run build` does not need environment variables. Public Supabase and site URL values are optional at build time; the app keeps local-only behavior when they are unset. Do not put real secrets in CI.
