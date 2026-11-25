# Architecture

## Boundaries

`src/game/simulation.ts` is pure TypeScript. It owns entities, inputs, active time, collision rules, weapons, AI, spawning, score, and lifecycle. It imports only typed gameplay configuration. It does not know about React, PixiJS, browser events, storage, or HTTP.

`src/game/GameCanvas.tsx` binds a simulation to one PixiJS application. `rendering.ts` maps entities to display objects; `input.ts` translates keyboard and focus events into normalized controls. React in `App.tsx` owns menus, options, dialogs, result handling, and semantic HUD. The HUD samples at 100 ms intervals rather than following every rendered frame. Continuous entity state stays in the simulation.

The data path is React → TanStack Query → Axios → MSW handlers → versioned local storage. Features do not read confirmed mock records directly to simulate a server acknowledgement. `contracts.ts`, fixtures, and handlers are shared by browser demonstration and Node HTTP tests.

## Time and lifecycle

`GameSimulation.advance(deltaSeconds)` caps each real frame to 0.25 seconds and consumes 1/60-second fixed ticks. This prevents unbounded catch-up after stalls. A seed-driven generator supplies reproducible spawns; no gameplay rule reads wall-clock time. Tests can call the same `step()` repeatedly. Dropping excess stall time is intentional: the timer tracks simulated active time, not elapsed wall time.

The lifecycle is `running` → `paused` → `running`, or `running` → `ended`, followed by terminal `disposed` when session ownership ends. `ended` is the finished-match state. Time or death sets the reason, clears input and stops all future updates. Pause clears the accumulator and held normalized actions; resume also clears them and requires explicit UI action. `dispose()` is idempotent, clears transient entities and input, and preserves score/time/reason for captured results.

Each match deep-clones and freezes its configuration. Options changes affect only later matches. A restart constructs a fresh simulation and UUID. Abandonment does not invoke completion registration. Refresh recreates the app from persisted options and last completed result; active simulation state is never restored.

## Collision and combat

Ships and islands use logical circle colliders. Movement sweeps the ship center against island circles expanded by ship radius, stops just before first contact, and clamps the center so the full ship stays within the arena. A blocked ship can turn and sail away; there is no bounce or damage from islands.

Projectiles sweep a segment every tick against expanded island and target circles. The nearest intersection wins, and an island wins equal-distance ties. This prevents high-speed tunneling. Hits consume the projectile, apply damage once, and score exactly once on a player-caused enemy death. Lifetime and arena exit also remove shots. Friendly targets are excluded.

Player weapons are independent: one frontal shot, or three equally spaced parallel shots from either side. Cooldowns count down only during fixed active ticks. Player shots resolve before enemy decisions so an enemy killed in that tick cannot act. Chaser contact removes the Chaser without awarding a point. Death immediately terminates remaining simulation work.

## Enemies and balance

Both enemy types turn toward pursuit headings at bounded angular speed and move forward. If an island intersects the pursuit corridor, the AI chooses a tangent steering heading with a configured safety margin. This is local avoidance, not a global path planner; more elaborate obstacle layouts may need navigation improvements. Ship-to-ship solid-body resolution is not implemented because the specification only requires island and arena blocking, plus Chaser contact damage.

Shooters approach until their stop range, then fire while within attack range and angular tolerance. Chasers continue pursuit until collision. Spawns alternate types, sample arena edges with a seeded generator, reject obstacles, overlapping enemies and positions within 310 pixels of the player, and retry within a bounded attempt count. A 36-enemy cap protects responsiveness; an interval can produce no spawn when the cap or safety constraints prevent one. This is an explicit trade-off against unlimited spawning and needs evaluation under the shortest spawn setting.

Default player speed is 190 px/s versus 95 for Chasers and 75 for Shooters, allowing escape and repositioning. A 20-HP player shot takes two hits to defeat a 40-HP Chaser or three for a 60-HP Shooter; a successful triple broadside can sink a Shooter. Player HP is 100, Chaser damage 22, and enemy projectile damage 12. The 0.38-second frontal cooldown supports aiming; independent 1.1-second broadsides reward positioning. The default three-second alternating arrivals ensure both types appear early. All balance values and units live in `config.ts`.

## PixiJS and assets

One cached loading promise loads the supplied ship, damage, projectile, explosion, fire, and tile textures. Failure clears the promise so retry is possible. Combat begins updating only once texture loading and `Application.init` succeed. Loading and retry UI remain React-owned.

The arena uses 1200 × 720 logical coordinates and CSS aspect-ratio scaling. Pixel resolution is capped at two device pixels per logical pixel to limit GPU cost. Touch controls are relative actions rather than canvas coordinates. Visual state uses original ship sprites, damaged variants, fire, hit tint, wakes, explosions, cannonballs, and per-entity Pixi health bars. Islands combine circle geometry matching the collision model with supplied foliage and rock tiles; procedural coastline geometry is a deliberate simplification of the supplied reference terrain.

The renderer owns display objects and tile subtextures; Pixi Assets owns shared source textures across matches. Removed entities destroy their display objects. Session cleanup stops audio, removes input listeners, destroys the application/ticker/stage and canvas, releases subtextures without destroying shared sources, and removes test instrumentation. Asynchronous initialization checks disposal before attaching resources. Strict Mode effect replay cleans view resources without disposing a simulation that the replacement effect still owns.

Resource ownership is implemented, but repeated-cycle heap and GPU retention are not yet measured. Keeping a bounded shared texture cache is intentional and should not be mistaken for a session leak.

## Input and accessibility

Keyboard and touch write the same six normalized actions. Keyboard aliases are tracked separately; blur and hidden-document events pause and clear holds. Pointer controls use capture and clear on release, cancellation, and lost capture. Gameplay keys are active only while a running game owns input listeners; text fields and focused button Space activation are protected.

React uses native buttons, labelled number fields, native modal dialogs with focus restoration, table headers, status/error messages, and a semantic HUD including a health meter. Score and time are not live-announced each frame. Contrast, clipping, actual multitouch, and all focus paths still require browser validation; implementation alone is not proof of accessibility conformance.

## REST and query ownership

| Endpoint            | Request                                                   | Response                              |
| ------------------- | --------------------------------------------------------- | ------------------------------------- |
| `GET /api/ranking`  | page, complete canonical configuration, playerId          | `PageResult<MatchRecord>`             |
| `GET /api/history`  | page, playerId, configuration for demo fixture generation | `PageResult<MatchRecord>`             |
| `POST /api/history` | `MatchRecord`; `Idempotency-Key` set to match UUID        | Existing or newly saved `MatchRecord` |

A record carries UUID, player ID/name, completion ISO timestamp, score, effective duration, end reason, and complete configuration. Runtime guards reject malformed records. The demo player is the fixed local identity `local-captain`, not an authenticated online identity.

Ranking filters confirmed records to the canonical full configuration, sorts score descending, timestamp ascending, then ID ascending. Object insertion order cannot create separate leagues. Fixtures are synthesized for the selected league. History contains all configurations for the local player, newest timestamp first with ID tie-break. Pages contain five rows.

Query keys include resource, page, configuration key, and player ID. Axios receives the TanStack cancellation signal; a response from an old page/configuration belongs to a different cache entry. Queries are stale immediately, refetch on mount and focus, and retry transient failures once after 400 ms. HTTP 4xx queries do not retry. Mutations require explicit retry, avoiding automatic timeout-after-save ambiguity. Both query families are invalidated after registration and pending recovery.

## Persistence and idempotency

Versioned storage separates options (`pirate.options.v1`), last result, pending outbox, confirmed mock records, acknowledged IDs, and scenario settings (`pirate-battle.*.v1`). Malformed saved data is discarded through parsing and guards. Settings loading trusts only validated duration/spawn values and reconstructs remaining balance from defaults.

Submission persists the outbox before HTTP, deduplicates concurrent requests in an in-flight map by UUID, and sends the stable ID. The handler checks the existing UUID before inserting. A successful response is validated before marking acknowledgement and removing the pending row. Client status never equates server-side mock persistence with received acknowledgement. Therefore timeout-after-save leaves a pending row; retry recovers the saved record without duplication. Old retries cannot replace a newer last result.

Recovery is explicit through result/ledger buttons after refresh. Pending records do not block starting another match. Storage change events update pending indicators. Network reset aborts registrations/cancels queries, increments a reset generation to reject stale writes, clears demo storage, and removes query data. Scenario changes preserve outbox records.

LocalStorage is the mock service's persistence mechanism, so there is no true multi-device backend or transactional cross-tab database. Concurrent tabs and browser quota denial need separate validation; single-tab UUID idempotency is covered by tests. The mock service starts in production too; startup failure shows a reload control rather than silently bypassing interception.

## Testing and evidence

The current `npm test` run passes 42 tests: 23 simulation tests and 19 Axios/MSW/data tests. Pure simulation fixtures position entities to test geometry and invariants; browser combat tests must instead use real controls. Unit coverage includes 30/60/120 FPS equivalence, immutable config, pause, swept collisions, weapons, scoring, AI, lifecycle/disposal, outbox recovery, idempotent timeout, configuration pagination, malformed persistence, endpoint failures, and seeded delays.

Playwright is configured for desktop Chromium and Pixel 7 emulation with isolated browser contexts, HTML reporting, and failure traces. The initial foundation suite covers options and a movement/fire/pause/abandon flow and passed all four desktop/mobile cases. `tests/e2e/lifecycle.spec.ts` adds asset retry, completion/refresh/restart, pagination/empty history, and pointer/blur handling. `tests/visual/screens.spec.ts` captures menu, deterministic arena and an actual simulated result. Those newer tests and generated candidate baselines are under validation. Completion of all twelve official groups, reviewed visual baselines, and production profiling remain separately tracked in `docs/REQUIREMENTS.md`.

`?test=1` opts into `window.__pirateTest`, starts with seed 42 and a manual clock, and permits snapshots, real fixed-tick advancement, switching to the normal clock, and metrics. It cannot directly assign score, HP, or positions. This opt-in interface exists in the browser build to support reproducible review; ordinary URLs do not expose it. Deterministic tests are not performance evidence: real-time profiling must turn the manual clock off and use an optimized build.

## Remaining delivery limitations

- Public deployment and URL smoke tests are pending.
- The full official E2E matrix and reviewed visual baselines are pending.
- Three-minute optimized-build performance and five-cycle memory evidence are pending.
- Mobile layout, keyboard focus, audio behavior, and repeated Strict Mode navigation require complete browser validation.
- CSS currently uses a scoped naming convention in one stylesheet rather than CSS Modules; splitting styles can follow stable UI validation without changing gameplay.
- Supplied asset licensing is not independently documented by the upstream repository; no extra asset license is asserted.
