# Vercel deployment

Production URL: https://pirate-battle-ivory.vercel.app

Vercel project: `bruno-costa2/pirate-battle`. Current deployment `dpl_7wC2JQ1LqekpKpM4HBAuJkMuq3BB` reached READY on 2026-11-26. Runtime source: commit `f6a4877`. The anonymous public page returned HTTP 200 and references the verified `index-Bxwh77Td.js` build. This update removes the arbitrary enemy cap and preserves safe blocked arrivals. Earlier deployments below are historical evidence.

## Account and authorization

1. Create the account at https://vercel.com/signup and complete its verification.
2. Run `npx --yes vercel login` from the project directory. Complete the displayed browser authorization personally; do not copy passwords or tokens into chat or source files.
3. Run `npx --yes vercel whoami` to verify the intended account.
4. Run `npx --yes vercel link` and create a dedicated `pirate-battle` project under the intended personal scope. The original company repository must never be linked or modified.

## Publish

Run `npm ci`, the required validations, and `npm run build`. Then use `npx --yes vercel --prod` to publish the checked source. Vite builds to `dist`; `vercel.json` declares the build and service-worker cache header. No secret or environment variable is required.

`.vercel` is local account/project state and is ignored. `.vercelignore` excludes the upstream reference checkout, test reports and profiling evidence from uploads.

## Public smoke tests

- Open the exact production URL in a fresh browser context with no Vercel login.
- Confirm menu and ship assets load, MSW starts, and ranking queries return fixtures.
- Play, pause, resume, complete a seeded match, and confirm registration/history.
- Reload the production URL and verify saved options/result.
- Confirm the worker URL returns JavaScript and the app does not require deployment-protection authentication.
- Record deployed source revision, actual URL, browser version and test result in README and the requirement checklist.

Do not mark deployment complete based only on a CLI upload or build success.

## Verified execution — 2026-11-25

```powershell
$env:PLAYWRIGHT_BASE_URL="https://pirate-battle-ivory.vercel.app"
npx playwright test tests/e2e/foundation.spec.ts tests/e2e/lifecycle.spec.ts tests/e2e/network.spec.ts
```

Result: **20 passed in 1.1 minutes**, Chromium 159.0.8154.6, desktop and Pixel 7 emulation. Coverage includes assets, options persistence, pause/resume, completion and refresh, ranking/history, pending recovery, timeout idempotency and out-of-order queries. The [HTML report](evidence/public-smoke.html) preserves this run. Physical mobile hardware and actual OS visibility changes were not tested.

## Verified correction release — 2026-11-26

Runtime commit `4771d73` was published as deployment `dpl_B4KpryfvWtAwjD29pKKN4SgQFCYr`. The anonymous page and worker returned HTTP 200 and the public HTML references the same `index-C9LUbyzR.js` artifact as the locally validated build.

The same public smoke command above, with `tests/e2e/accessibility.spec.ts` also included, passed **24 tests in 1.3 minutes**, desktop and mobile. The [current public HTML report](evidence/public-browser-report/index.html) includes the contrast measurements. This supersedes the earlier 20-test deployment result; the previous report is preserved as historical evidence.

## Continuous-spawn release — 2026-11-26

Runtime `f6a4877`, deployment `dpl_7wC2JQ1LqekpKpM4HBAuJkMuq3BB`, is publicly available without authentication. The public build matches `index-Bxwh77Td.js`. All **38 public desktop/mobile tests passed in 2.3 minutes**, covering accessibility, combat, foundation, lifecycle and network recovery. Run the previous smoke command with `tests/e2e/combat.spec.ts` and `tests/e2e/accessibility.spec.ts` added. The [current public report](evidence/spawn-public-report/index.html) records this run.
