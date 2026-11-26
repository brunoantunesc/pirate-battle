# Coverage audit and edge cases

Audit date: 2026-11-25. The official README's twelve groups are the acceptance structure. Browser tests execute real controls and production simulation rules; instrumentation only reads state and advances the fixed clock. Unit fixtures may construct isolated entities.

| Official group | Browser evidence | Edge cases |
| --- | --- | --- |
| 1 Navigation/options | foundation.spec.ts | Empty and out-of-range fields, persistence after refresh |
| 2 Assets | lifecycle.spec.ts; resources.spec.ts | Failed load/retry; abandon while a request is pending; no stale canvas |
| 3 Movement/collision | combat.spec.ts | Both turn directions, arena boundaries, island contact and blocked shot |
| 4 Weapons/scoring | combat.spec.ts | 1+3+3 independent batteries, cooldowns, actual hit damage and one-point kill |
| 5 Enemies/spawning | combat.spec.ts | Seeded spawn interval/safety, pursuit, non-scoring Chaser impact, Shooter fire |
| 6 Completion/restart | combat.spec.ts; lifecycle.spec.ts | Separate death/time endings, frozen ended state, new healthy empty session |
| 7 Pause | foundation.spec.ts; resources.spec.ts | Manual pause, blur, visibility event, no implicit resume or retained movement |
| 8 Results | lifecycle.spec.ts; storage.spec.ts | Refresh, exact end reason in combat tests, full storage and recovery |
| 9 Abandon/touch | resources.spec.ts; network.spec.ts | Five cycles, two simultaneous touch contacts, pointer capture/release/cancel |
| 10 Queries | network.spec.ts | Loading, empty, history pagination, isolated ranking/history errors |
| 11 Registration | network.spec.ts | Unavailable service, refresh, new match with pending submission, both tabs updated |
| 12 Idempotency/stale responses | network.spec.ts | Server-persisted timeout, repeated HTTP POSTs, record counts, superseded query cancellation |

Visual regression covers menu, deterministic arena and actual results, in both viewport projects. Baselines must be compared without `--update-snapshots` for acceptance.

## Bugs fixed during the audit

- A LocalStorage exception no longer strands an ended match on the combat screen. Results distinguish a durable pending record from a session-only result and allow retry.
- Dialogs trap Tab/Shift+Tab and close before restoring focus, including StrictMode cleanup.
- Space keyup no longer prevents native activation of focused buttons.
- A manual test clock renders on explicit advance instead of continuously consuming GPU frames. Normal gameplay still uses the Pixi ticker.

## Evidence limits

- The visibility test emulates the browser's `document.hidden` signal and dispatches `visibilitychange`; it exercises the real production listener. Headless Chromium does not hide tabs when another headless tab is brought forward. An OS-level minimize/tab-switch smoke test remains manual.
- Multitouch runs in the mobile Chromium project through actual CDP touch input. Its desktop duplicate is intentionally skipped.
- Five-cycle checks prove bounded instrumented canvas/input counts and absence of visible stale canvases, not absence of every heap/GPU leak. Five measured production cycles are recorded in PERFORMANCE.md; full heap-retainer classification remains open.
- Production FPS/P95 profiling and 20 public smoke tests are complete. Physical mobile hardware and a comprehensive contrast/screen-reader audit remain unverified.
- Tests cannot prove every collision arrangement or all browser versions. Swept geometry and frame-rate equivalence have additional unit coverage.

## Reproduction

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e`. Open the generated HTML report with `npm run test:report`. Failure traces are retained in `test-results/`. Do not run multiple browser suites simultaneously on the reference machine.

## Final execution evidence

2026-11-25: full Playwright run completed with 49 passed and one intentional desktop multitouch skip (2.5 minutes). Existing visual baselines matched without updating. Unit tests:42 passed; typecheck, lint and production build passed. HTML report:playwright-report/index.html. Subsequent delivery evidence includes real 180-second profiles and 20 passing public smoke tests under docs/evidence.
