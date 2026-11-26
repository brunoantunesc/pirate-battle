# Pirate Battle

A single-player naval shooter for the Jungle Gaming React & PixiJS technical challenge. Sail between islands, fire independent cannon batteries, and survive rival Chasers and Shooters. Every enemy sunk by your weapons earns one point.

**Public demo: [Play Pirate Battle](https://pirate-battle-ivory.vercel.app).** Published on Vercel; 38 desktop/mobile public tests passed on 2026-11-26. See [deployment evidence](docs/DEPLOYMENT.md).

**Source repository:** [brunoantunesc/pirate-battle](https://github.com/brunoantunesc/pirate-battle).

## Run locally

Use Node.js 22.14 or newer compatible Node 22, and npm. Install the committed dependency versions:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. MSW starts before the application and intercepts `/api/ranking` and `/api/history`; no private service, API key, or environment variable is required. Service workers require localhost or HTTPS. Allow local storage to retain options, results, and pending registrations.

## Controls

| Action                   | Keyboard                    | Touch                       |
| ------------------------ | --------------------------- | --------------------------- |
| Move forward             | W or Up Arrow               | Hold Forward                |
| Turn left / right        | A / D or Left / Right Arrow | Hold Turn left / Turn right |
| Fire bow cannon          | Space                       | Hold Fire front             |
| Fire port broadside      | Q                           | Hold Fire port              |
| Fire starboard broadside | E                           | Hold Fire starboard         |
| Pause                    | Esc or Pause button         | Pause button                |
| Resume                   | Resume button               | Resume button               |

Movement and attacks can be combined. Each broadside fires three parallel shots and has its own cooldown. Losing focus or hiding the tab pauses combat; returning does not resume it automatically. Refresh or Abandon Match discards active combat without recording it.

Desktop and mobile layouts support portrait and landscape; landscape is recommended for the widest arena. Logical arena size remains 1200 × 720 in either orientation. Browser checks cover desktop, mobile portrait and landscape resize cases; physical-device testing is not claimed.

## Configuration

Options exposes **Game session time** (60–180 seconds) and **Enemy spawn time** (1–15 seconds). Defaults are 120 and 3 seconds. Saved options apply to the next match; each active match captures an immutable configuration snapshot.

All balance parameters are in `src/game/config.ts`: hit points, logical pixels, radians, seconds, weapon damage, speeds, cooldowns, spawn sequence and safety distance. The default spawn sequence alternates Chaser and Shooter. There is no live-enemy cap; a deterministic safe-position search backs up random spawning, and blocked arrivals are retained for the next interval. The player has 100 HP, frontal cooldown is 0.38 seconds, and each broadside cooldown is 1.1 seconds. Islands block ships and shots. Matches end on death or active-time expiry.

## Ranking and history

Open **Ranking & Match History** from the menu. Ranking compares the complete configuration, sorts by score descending, then completion timestamp ascending and match ID ascending. History shows this browser's local captain, newest first. Lists contain five records per page. Fixtures represent other captains; this is a local simulated service, not a shared online leaderboard.

Completed matches are saved to a persistent outbox before HTTP submission. Results distinguish acknowledgement from pending registration. After a failure or refresh, use **Retry Registration** on the last result, or **Retry pending matches** in the ledger. You can play while records remain pending. Repeated registration uses the same UUID and does not create duplicates.

## Network scenarios and reset

Expand **Network demo settings** on the main menu. Selecting a scenario preserves pending records and refreshes queries. The default seed is 42 and normal latency is 200 ms; test code sets seed and latency through the shared scenario module.

| Selection                            | Behavior                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| Success                              | Normal responses and persistent registration                                            |
| Empty lists                          | Queries return no rows; stored records are retained                                     |
| Multiple pages                       | Additional rival and local demonstration fixtures                                       |
| Slow response                        | 1800 ms response delay                                                                  |
| Variable latency                     | Deterministic seeded 50–1749 ms delay                                                   |
| Out-of-order responses               | Alternating 1800 / 50 ms delays                                                         |
| Timeout                              | 5000 ms service delay exceeds the 2500 ms Axios timeout                                 |
| Connection failure                   | Network error                                                                           |
| HTTP 400                             | Rejected request                                                                        |
| HTTP 500                             | Server failure represented by HTTP 503                                                  |
| Ranking / History query failure      | Only the selected query endpoint fails                                                  |
| Timeout after successful persistence | First submission persists, then delays its response; retry recovers the existing record |
| Unavailable during match completion  | Service returns HTTP 503; completed matches remain pending                              |

To reproduce recovery, select **Unavailable during match completion**, complete a match, return to the menu, select **Success**, then retry the pending match in the ledger. For idempotency, select **Timeout after successful persistence**, complete a match, wait for the timeout, and retry; only one record should appear in each list.

**Reset network and demo records** clears confirmed matches, pending matches, acknowledgements, last result, and scenario preferences. It preserves gameplay options. Use Success rather than reset when testing recovery, so the pending evidence remains available.

## Commands

| Command               | Purpose                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `npm run dev`         | Local Vite development server                                          |
| `npm run build`       | Strict TypeScript check and optimized build into `dist`                |
| `npm run preview`     | Serve the optimized build locally                                      |
| `npm run lint`        | ESLint                                                                 |
| `npm run typecheck`   | TypeScript without emitting files                                      |
| `npm run format`      | Format source, tests, and documentation                                |
| `npm test`            | Vitest simulation and HTTP/data tests                                  |
| `npm run test:e2e`    | Playwright desktop and mobile Chromium suites                          |
| `npm run test:e2e:ui` | Interactive Playwright runner                                          |
| `npm run test:visual` | Run tests matching `visual`; compare the six versioned baseline images |
| `npm run test:report` | Open the generated Playwright HTML report                              |

Install the test browser with `npx playwright install chromium` before the first E2E run. Playwright starts Vite automatically unless the local server is already running. Every test receives an isolated browser context. Failed runs retain traces and screenshots under `test-results`; HTML reports are generated under `playwright-report`. These working directories are ignored by Git. The validated delivery reports are versioned under `docs/evidence/browser-report` and `docs/evidence/public-browser-report`, with profiling data and a diagnostic failure trace in `docs/evidence`.

For deterministic combat tests use `/?test=1`. The opt-in `window.__pirateTest` exposes cloned observations and a clock that advances real fixed simulation ticks; use actual keyboard or pointer controls for combat actions. Normal play omits this query parameter. See [architecture](ARCHITECTURE.md) for test limitations.

## Deployment

The repository includes `vercel.json`: build with `npm run build`, publish `dist`, and avoid caching `mockServiceWorker.js`. No environment variables are needed. Deployment must be authorized and performed against the solution's own repository/account, never the original challenge remote. After publishing, verify assets, MSW interception, a completed registration, both ledger tabs, refresh, and a mobile session at the returned public URL. Verified runtime revision: `f6a4877`, including safe continuous spawning, accessibility and memory corrections. Subsequent documentation commits record public verification.

## Evidence and validation scope

Final validation on 2026-11-26: 46 unit tests passed; the complete optimized-build browser suite passed 53 cases with one intentional desktop multitouch skip. Typecheck, lint and production build passed. See docs/COVERAGE-AUDIT.md for all twelve official groups and explicit evidence limits. Production profiling and public deployment are complete. A real 180-second match measured 59.97 FPS / 16.70 ms P95 on RTX 3060, and 15.37 FPS with software rendering. A subsequent retaining-path audit found and corrected unused MSW diagnostic streams: native MessagePorts now remain at 2 across five real cycles. Compilation and debugger-history growth are classified separately in the report. See the performance report for scope and limitations.

- [Official challenge, preserved verbatim](docs/CHALLENGE.md)
- [Requirement checklist and evidence](docs/REQUIREMENTS.md)
- [Architecture, balance, and trade-offs](ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Required accessibility verification](docs/ACCESSIBILITY.md)
- [Spawn correction unit report](docs/evidence/spawn-unit.json)
- [Spawn correction browser report](docs/evidence/spawn-browser-report/index.html)
- [Previous optimized-build browser report](docs/evidence/browser-report/index.html)
- [Public smoke HTML report](docs/evidence/spawn-public-report/index.html)
- [Performance measurements and limitations](docs/PERFORMANCE.md)

## Asset credits

Game art, UI sprites, reference images, tiles, and WAV sounds are supplied by [Jungle Gaming's challenge repository](https://github.com/junglegaming/game-developer-challenge), source commit `315891441be81ca0bff75cf3c2b0cd2f27f119cd`. They are preserved in `public/assets`. No supplementary artwork is used. Typography uses Barlow Condensed and DM Sans loaded through Google Fonts, with system font fallbacks if the font service is unavailable. Both fonts use SIL Open Font License 1.1: [Barlow Condensed license and authors](https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt), [DM Sans license and authors](https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt). The supplied repository does not include an asset license file; no additional redistribution license is inferred here. Dependencies retain their respective package licenses.
