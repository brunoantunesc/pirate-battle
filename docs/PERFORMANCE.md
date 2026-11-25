# Performance evidence

## Current status

**Not measured yet.** No FPS, frame-time percentile, heap-growth conclusion, or 60-FPS compliance claim is available. Unit tests and TypeScript/lint checks do not establish browser performance. A three-minute production-build run and five start/play/exit memory cycles remain required before delivery.

The renderer already exposes opt-in counters and frame metrics. The instructions below are a reproducible measurement procedure, not evidence that the procedure has been executed.

## Reference environment record

Record the actual environment alongside each measurement:

| Field         | Value to capture                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Source        | Exact Git commit and build timestamp                                                               |
| Hardware      | CPU model, GPU model, physical RAM, power mode                                                     |
| OS            | Version/build                                                                                      |
| Browser       | Exact Chromium/Chrome version; headful or headless                                                 |
| Graphics      | Hardware acceleration state; renderer; any throttling                                              |
| Display       | Viewport width/height, screen refresh rate, devicePixelRatio                                       |
| Pixi          | Actual capped renderer resolution                                                                  |
| Configuration | Full `src/game/config.ts` snapshot with 180-second duration and chosen spawn interval              |
| Seed          | 42 for the reproducible instrumented run                                                           |
| Assets        | Cold or warm cache, recorded separately                                                            |
| Observation   | Active gameplay seconds, completion reason, frame count, FPS, P95 frame interval, maximum entities |

Do not omit software rendering or headless limitations. Do not generalize one machine's measurements into a guarantee for all mobile devices.

## Three-minute production run

1. Run `npm ci`, `npm run build`, then `npm run preview -- --port 4173`.
2. Open `http://127.0.0.1:4173/?test=1` in the target browser. Use a clean browser profile or reset demo records. Set session time to 180 seconds; retain the documented spawn interval. Keep network scenario Success.
3. Start the match and wait for assets to finish loading. The test URL initially freezes the simulation clock. Before enabling real time, install a measurement sampler in DevTools:

```js
window.pirateProfile = [];
window.pirateProfileTimer = setInterval(() => {
  const api = window.__pirateTest;
  if (!api) {
    clearInterval(window.pirateProfileTimer);
    return;
  }
  const state = api.snapshot();
  window.pirateProfile.push({
    time: state.time,
    status: state.status,
    reason: state.reason,
    hp: state.player.hp,
    enemies: state.enemies.length,
    projectiles: state.projectiles.length,
    effects: state.effects.length,
    ...api.metrics(),
  });
}, 1000);
window.__pirateTest.setManualClock(false);
```

4. Focus the game and use actual controls to survive the full 180 active seconds. DevTools focus changes can pause the game; use Resume deliberately. Do not use manual clock advancement, alter health, suppress collisions, or remove enemies for the measured run. An early death is a partial sample, not the required three-minute result; retain it as such and rerun.
5. Export `JSON.stringify(window.pirateProfile, null, 2)` and retain the configuration, hardware information, viewport, browser version, and completion screenshot alongside it. Capture a browser Performance trace of representative combat; keep tracing overhead separate from the untraced FPS measurement.
6. Report the final active sample's FPS, P95 frame interval, frame count and maximum entity count. Explain missing final samples: the UI removes the session instrumentation shortly after completion, and this one-second sampler may end just before the exact final tick. Use the browser trace or a finer observer if exact final-tick evidence is required.

`metrics().fps` is rendered running-frame count divided by accumulated Pixi elapsed milliseconds. P95 sorts up to the first 15,000 running-frame intervals and picks index `floor(N * 0.95)`. `maxEntities` includes player, enemies, projectiles and effects. Metrics include running-state rendering, so time spent with the manual clock enabled must not be mixed into performance results. The current counters are not automatically reset when switching clocks; enable real time immediately after loading and disclose any warm-up interval, or add an explicit measurement reset before treating the result as final evidence.

The player may die before three minutes at aggressive spawn settings. The production run must preserve normal rules and record the actual completion reason. If no complete run can be obtained, document that unmet requirement instead of reporting an accelerated or invulnerable session as a normal match.

## Five-cycle memory investigation

1. Use the same optimized build and recorded hardware. Take a baseline after initial assets are warmed. Keep the shared texture cache in mind: one-time growth from loading assets is expected.
2. Take a DevTools heap snapshot after explicit garbage collection. Record JS heap size, DOM nodes, listener counts where available, and retained `Application`, `BattleRenderer`, canvas, audio, ticker and controller objects.
3. Repeat five times: start, play for a fixed documented interval (for example 20 active seconds), pause, abandon, and return to the menu. Exercise real inputs and wait for the canvas to disappear. Confirm one canvas and one input binding during each active session, never increasing across cycles.
4. After each cycle, collect garbage using DevTools and take a snapshot. Compare retained object counts and retaining paths, not merely the browser process RSS. GPU allocation and allocator reservations may remain high without retaining live sessions.
5. Record a table with cycle number, active play duration, retained canvases/applications, heap size, object deltas, and any listener/ticker retention. Investigate monotonic growth and attach relevant retaining-path screenshots or exported heap snapshots.
6. Repeat rapid start/abandon during loading and asset retry under the development Strict Mode build as a lifecycle stress test. Label this separately from optimized-build performance.

Session counters are available only while `window.__pirateTest` exists; menu cleanup removes that API. Use DOM inspection and heap snapshots for post-exit evidence rather than assuming deleted instrumentation proves all resources were freed.

## Delivery artifacts

Store the measured summary here and attach raw samples/traces/heap evidence through the final submission or CI artifact. Record artifact filenames and the corresponding source commit. Do not commit large heap snapshots, unrelated machine information, or private browser-profile data.

| Required evidence                         | Status |
| ----------------------------------------- | ------ |
| Three-minute optimized-build combat       | TODO   |
| Hardware/browser/resolution/configuration | TODO   |
| FPS, P95 frame interval, entity counts    | TODO   |
| Five-cycle memory comparison              | TODO   |
| Investigation of any retained resources   | TODO   |

Until these rows have real artifacts, performance remains unverified.
