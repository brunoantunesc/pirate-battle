# AGENTS.md

## 1. Project Context

Pirate Battle is a single-player, top-down 2D naval shooter developed for the Jungle Gaming technical challenge.

- Original repository: https://github.com/junglegaming/game-developer-challenge
- Delivery deadline: two business days.
- Primary objective: maximize evaluation coverage while delivering a reliable, maintainable, visually polished game.
- Target platform: desktop and mobile browsers.

The official challenge specification is the source of truth. Read `docs/CHALLENGE.md` before making significant architectural or implementation decisions.

If project instructions conflict with the official specification, prioritize the specification and document the conflict.

## 2. Language

- Communicate with the project owner in Brazilian Portuguese.
- Write all source code, identifiers, comments, documentation, UI text, error messages, and commit messages in English.

## 3. Evaluation Priorities

| Area | Points |
|---|---:|
| Gameplay, rules, collisions, and enemy behavior | 35 |
| PixiJS, architecture, and resource lifecycle | 20 |
| UI, feedback, responsiveness, and accessibility | 15 |
| TanStack Query, Axios, and data consistency | 10 |
| MSW and network failure scenarios | 5 |
| Playwright testing | 10 |
| Performance and documentation | 5 |
| Total | 100 |

Prioritize a complete, playable game before optional polish.

All mandatory requirements must remain tracked, even when temporarily deferred.

## 4. Technology Stack

### Required

- React
- TypeScript with strict mode
- PixiJS
- TanStack Query
- Axios
- MSW
- Playwright

### Project Defaults

- Vite
- npm
- ESLint
- Prettier
- CSS Modules
- CSS custom properties
- LocalStorage
- Vercel

Use stable, mutually compatible dependency versions.

Verify APIs against the installed version before implementation. Do not assume that examples from older PixiJS versions remain valid.

Do not introduce additional runtime dependencies unless they provide clear value.

Do not use a physics engine or another game engine to replace the required gameplay implementation.

## 5. Working Principles

- Prefer working software over speculative architecture.
- Prefer simple, explicit implementations over clever abstractions.
- Implement vertical slices that can be validated independently.
- Keep the application runnable throughout development.
- Avoid premature optimization.
- Avoid unrelated refactoring.
- Fix root causes rather than hiding symptoms.
- Make reversible technical decisions autonomously.
- Ask the project owner only when blocked by credentials, irreversible operations, conflicting requirements, or consequential product decisions.
- Never stop at planning when implementation has been requested.
- Never fabricate tests, performance measurements, screenshots, or execution results.
- Never silently omit a mandatory requirement.
- Never modify the original Jungle Gaming remote repository.

The deadline is short. Every abstraction, dependency, and optional feature must justify its implementation cost.

## 6. Repository Structure

Use the following structure as a reference, adapting it when justified:

```text
public/
  assets/
  mockServiceWorker.js

src/
  app/
  game/
    core/
    config/
    entities/
    systems/
    rendering/
    input/
  features/
    menu/
    settings/
    gameplay/
    results/
    ranking/
    history/
  api/
  mocks/
  shared/

tests/
  e2e/
  visual/

docs/
  CHALLENGE.md
  REQUIREMENTS.md
  ROADMAP.md
  PERFORMANCE.md

AGENTS.md
ARCHITECTURE.md
README.md
```

Organize files by responsibility and feature.

Do not create empty directories, speculative interfaces, or unnecessary abstraction layers.

## 7. Architectural Boundaries

### Dependency Direction

The game simulation must remain independent of React, PixiJS, browser input events, and network requests.

```text
React UI
    |
Game Controller
    |
    +-- Input
    +-- Simulation
    +-- PixiJS Renderer

React UI
    |
TanStack Query
    |
Axios
    |
MSW REST API
    |
Persistent Mock Storage
```

### Simulation

Responsible for:

- Entity state.
- Movement and rotation.
- Collision detection and resolution.
- Combat and damage.
- Enemy behavior.
- Spawning.
- Cooldowns.
- Active match time.
- Scoring.
- Match lifecycle.

Simulation rules must be testable without rendering.

### Rendering

PixiJS is responsible for:

- Water and arena.
- Islands and obstacles.
- Ships.
- Projectiles.
- Combat effects.
- Ship deterioration.
- Health indicators above entities.

Rendering must represent simulation state without owning gameplay rules.

### React

React is responsible for:

- Navigation.
- Main menu.
- Options.
- Semantic HUD.
- Dialogs.
- Pause interface.
- Results.
- Ranking.
- Match history.
- Accessible controls.

Do not store continuously changing entity positions in React state.

Do not trigger React renders on every simulation frame.

Publish meaningful UI snapshots and lifecycle events instead.

### Remote State

TanStack Query owns remote query state and mutation state.

Axios owns HTTP transport.

MSW owns simulated network behavior.

Do not bypass HTTP calls by importing mock storage directly into application features.

Network failures must never interrupt gameplay.

## 8. Simulation and Time

Prefer a fixed timestep simulation with rendering separated from simulation updates.

Requirements:

- Frame-rate-independent movement.
- Frame-rate-independent cooldowns and spawning.
- Consistent collision and combat behavior.
- Bounded catch-up after long frames.
- Seeded random number generation.
- Controllable simulation clock for tests.
- No direct dependency on wall-clock time inside gameplay rules.

Use consistent time and distance units.

Document units in the configuration and relevant interfaces.

Never use independent uncontrolled timers for individual enemies, projectiles, or cooldowns.

The game lifecycle must explicitly distinguish running, paused, finished, and disposed states.

## 9. Gameplay Invariants

These rules must remain true across all implementations.

### Movement

- The player moves forward and rotates in both directions.
- Movement and attacks can occur simultaneously.
- Ships cannot leave the arena.
- Ships cannot pass through islands.
- Enemy movement follows the same obstacle constraints.

### Combat

- The frontal weapon fires one projectile.
- Each lateral weapon fires three parallel projectiles.
- Left and right lateral attacks are independently accessible.
- Every weapon respects its configured cooldown.
- Projectiles respect direction, speed, damage, range, and lifetime.
- Islands block projectiles.
- Each projectile applies damage at most once.
- Destroyed entities cannot attack, move, or cause additional collision damage.
- Expired, consumed, and out-of-bounds projectiles are removed.

Prevent tunneling through obstacles or targets where projectile speed makes discrete collision detection insufficient.

### Enemies

Chasers pursue the player and explode on contact.

A Chaser self-destructing against the player does not award points.

Shooters approach the player and attack when within configured range.

Both enemy types must appear in a standard match.

Spawn positions must be valid, obstacle-free, and sufficiently distant from the player.

### Scoring

- Each enemy destroyed by player attacks awards exactly one point.
- No duplicate scoring.
- No points for Chaser self-destruction.
- No scoring after match completion.

### Match Lifecycle

- Match duration is configurable from 60 to 180 seconds.
- Only active gameplay time counts.
- Match ends when time expires or player health reaches zero.
- Match completion stops all gameplay systems.
- Restart creates an entirely new match state.
- Abandoned matches are never registered.
- Refresh abandons an active match.
- Completed results persist locally.
- Every match uses an immutable configuration snapshot.

### Pause

- Support manual pause.
- Automatically pause on window blur and document visibility loss.
- Resume requires explicit player action.
- Suspend simulation, cooldowns, spawning, and active match time.
- Clear held input when pausing or losing focus.
- Do not accumulate gameplay updates during pause.

## 10. Configuration and Balance

Centralize gameplay parameters in typed configuration objects.

Include:

- Match duration.
- Spawn interval.
- Enemy distribution.
- Ship health.
- Movement speed.
- Rotation speed.
- Collision dimensions.
- Weapon damage.
- Projectile speed.
- Projectile lifetime and range.
- Weapon cooldowns.
- Shooter attack range.
- Spawn safety distance.

Avoid magic numbers in gameplay systems.

Validate persisted settings before use.

Define and document minimum and maximum spawn intervals.

The Options screen must expose game session time and enemy spawn time.

Configuration changes apply only to new matches.

Document balance decisions and their rationale in `ARCHITECTURE.md`.

## 11. PixiJS Resource Management

Treat resource lifecycle as a critical evaluation requirement.

- Load required assets before combat begins.
- Provide visible loading feedback.
- Handle loading failures and retries.
- Reuse textures and shared resources.
- Avoid loading assets inside the frame loop.
- Avoid unnecessary allocations inside hot paths.
- Maintain explicit ownership of PixiJS resources.
- Dispose of entity-specific display objects when no longer needed.
- Do not destroy shared textures while they are still in use.
- Remove ticker callbacks and event listeners on disposal.
- Handle asynchronous initialization safely.
- Prevent duplicate applications under React Strict Mode.
- Prevent stale asynchronous callbacks from modifying disposed sessions.

Support repeated navigation between menu and gameplay without resource accumulation.

Use logical arena coordinates independent of canvas pixel density.

Preserve aspect ratio, input alignment, and arena boundaries after resizing.

## 12. Input Management

Create a normalized input representation shared by keyboard and touch controls.

Input handlers should update input state rather than directly mutate game entities.

Requirements:

- Simultaneous movement and attacks.
- Independent attack actions.
- Multitouch support.
- Pointer cancellation handling.
- Safe pointer release.
- Input reset on pause, blur, and disposal.
- No gameplay keyboard capture outside the active gameplay context.
- No interference with menu navigation or form inputs.

Document all controls in the interface and README.

## 13. Visual Direction

The application should look and feel like a complete pirate naval game.

Use the supplied assets as the primary visual identity.

Inspect the provided sprite atlases, UI metadata, reference images, and sound files before introducing complementary assets.

Do not replace provided assets with generic shapes unless required for debugging or justified by a documented limitation.

Prioritize:

- Consistent nautical and pirate styling.
- Clear visual hierarchy.
- Readable typography.
- Themed menus and buttons.
- Responsive combat controls.
- Visible health indicators.
- Readable combat effects.
- Distinct enemy types.
- Clear damage and destruction feedback.
- Consistent spacing and component styling.

Avoid an administrative dashboard aesthetic.

Do not sacrifice gameplay readability for visual effects.

Document sources and licenses for supplementary assets.

## 14. UI and Accessibility

Required screens and states:

- Main Menu.
- Options.
- Gameplay.
- Pause.
- Match Results.
- Ranking.
- Match History.
- Asset loading and loading failure.
- Network loading, empty, and error states.

Requirements:

- Responsive desktop and mobile layouts.
- No clipped arena or HUD.
- Document supported mobile orientation.
- Semantic HTML where appropriate.
- Accessible button names.
- Associated form labels.
- Visible keyboard focus.
- Dialog focus management.
- Sufficient contrast.
- Accessible validation messages.
- Semantic score, time, and match status.
- No screen-reader announcements every frame.

Canvas rendering does not replace semantic UI information.

## 15. REST API and Remote Data

Define shared TypeScript contracts for ranking, match history, and match registration.

Every completed match record must include:

- Match identifier.
- Player identifier.
- Completion date.
- Score.
- Effective duration.
- End reason.
- Configuration snapshot.

Ranking must compare equivalent configurations.

Use a documented deterministic tie-breaking rule.

### TanStack Query

- Include relevant pagination and configuration parameters in query keys.
- Handle loading, empty, error, and background fetching states.
- Invalidate ranking and history after successful registration.
- Refresh data when the relevant tabs become active.
- Use appropriate retry policies.
- Support request cancellation where applicable.
- Prevent stale responses from replacing newer query results.

### Axios

- Use a shared configured HTTP client.
- Define explicit request timeouts.
- Normalize transport errors.
- Preserve cancellation semantics.
- Use typed request and response contracts.

Avoid unnecessary global state for remote data.

## 16. Idempotency and Persistence

Match registration must be idempotent.

Use a stable match identifier as the registration identity.

A completed match must produce exactly one history record and one corresponding ranking entry, regardless of:

- Repeated clicks.
- Retries.
- Request timeouts.
- Refresh.
- Delayed responses.
- Temporary network failures.

Persist pending registrations before attempting network submission.

Remove pending records only after confirmed successful registration.

A timeout after server-side persistence must be recoverable without duplicates.

Use a persistent outbox when appropriate.

The player must be able to start another match while pending registrations exist.

Persist and validate:

- Player identity.
- Gameplay settings.
- Last completed result.
- Confirmed mock records.
- Pending match registrations.
- Selected network scenario, when appropriate.

Use versioned storage keys and safe parsing.

Malformed persisted data must not crash the application.

## 17. MSW Requirements

MSW must intercept real Axios requests in development, tests, and the published application.

Share contracts, handlers, fixtures, and scenario definitions.

Implement reproducible scenarios for:

- Success.
- Empty lists.
- Multiple pages.
- Slow responses.
- Variable latency.
- Out-of-order responses.
- Timeout.
- Connection failure.
- HTTP 4xx errors.
- HTTP 5xx errors.
- Ranking query failure.
- History query failure.
- Timeout after successful match persistence.
- Temporary registration unavailability.
- Recovery after failure.

Provide a documented scenario selector and reset mechanism.

Keep mock data consistent between ranking and match history.

Use deterministic latency and randomness during tests.

Do not configure mocks exclusively for development mode.

Ensure the service worker is available in the production build and starts before API requests are issued.

Mock initialization failure must be handled explicitly.

## 18. Code Quality

### TypeScript

- Keep strict mode enabled.
- Avoid explicit `any`.
- Prefer `unknown` for untrusted external data.
- Use type narrowing.
- Model lifecycle states with discriminated unions when useful.
- Prefer explicit domain types.
- Avoid unsafe type assertions.
- Do not suppress compiler errors without a documented technical reason.

### General

- Use descriptive identifiers.
- Keep modules focused.
- Prefer pure functions for gameplay calculations.
- Document non-obvious algorithms and invariants.
- Avoid comments that merely restate code.
- Avoid duplicated business rules.
- Avoid unnecessary barrel files and circular dependencies.
- Keep error handling explicit.
- Never swallow unexpected errors silently.
- Remove temporary debug logs before delivery.

### React

- Keep effects focused on external synchronization.
- Ensure every acquired resource has a cleanup path.
- Avoid redundant derived state.
- Avoid unnecessary memoization.
- Do not disable Strict Mode to work around lifecycle bugs.

## 19. Testing Strategy

Playwright is the required end-to-end testing framework.

Implement coverage for all twelve official test groups:

1. Navigation, option validation, and persistence.
2. Asset loading, failure, and retry.
3. Movement, rotation, boundaries, and island collisions.
4. Frontal and lateral weapons, damage, cooldowns, and scoring.
5. Enemy behavior and spawn timing.
6. Match completion, simulation interruption, and restart.
7. Pause, focus loss, and safe resume.
8. Results and persistence after refresh.
9. Abandonment, repeated navigation, and touch controls.
10. Ranking and history pagination, loading, empty, and error states.
11. Match registration, invalidation, and pending recovery.
12. Timeout idempotency and out-of-order responses.

Run principal flows using Chromium desktop and mobile configurations.

Include versioned visual regression baselines for:

- Main menu.
- Deterministic gameplay state.
- Results screen.

### Test Reliability

- Isolate persistent storage between tests.
- Use seeded scenarios.
- Use controlled simulation time.
- Prefer accessible locators.
- Avoid arbitrary sleep calls.
- Wait for meaningful application states.
- Ensure animations are stable during screenshot capture.
- Generate HTML reports.
- Capture traces on failures.

### Test Instrumentation

Test instrumentation may observe simulation state and control simulation time.

It must not replace gameplay rules, fabricate successful actions, bypass collision detection, or directly assign expected results.

Combat tests must exercise actual game controls and verify their consequences.

Keep test-only instrumentation isolated from normal production behavior.

Never update visual baselines merely to hide regressions.

## 20. Performance

Target 60 FPS in the documented reference environment.

Use production builds for performance measurements.

Measure a three-minute match and record:

- Frame rate.
- P95 frame interval.
- Entity counts.
- Hardware.
- Browser version.
- Resolution.
- Device pixel ratio.
- Match configuration.
- Measurement limitations.

Investigate memory usage across five start-play-exit cycles.

Look for retained:

- PixiJS applications.
- Display objects.
- Textures.
- Ticker callbacks.
- Event listeners.
- Timers.
- Entities.
- Game controllers.

Avoid premature object pooling or complex optimizations without profiling evidence.

Never report estimated performance as measured performance.

Record evidence and reproduction steps in `docs/PERFORMANCE.md`.

## 21. Development Commands

Maintain the following npm scripts:

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run typecheck
npm run test:e2e
npm run test:e2e:ui
npm run test:visual
```

Additional scripts are allowed when useful.

Use the committed lockfile for reproducible installation:

```bash
npm ci
```

Before completing a significant implementation task, run the applicable checks:

```bash
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Run focused tests during development and the complete relevant suite before delivery.

If a command cannot run, report the exact blocker.

Do not claim a command passed unless it was actually executed successfully.

## 22. Git Workflow

- Preserve existing user changes.
- Inspect repository status before editing.
- Keep commits focused and coherent.
- Use descriptive English commit messages.
- Commit the dependency lockfile.
- Do not commit secrets, credentials, or private environment files.
- Do not force-push.
- Do not use destructive Git commands without explicit authorization.
- Do not modify the original upstream repository.
- Do not publish or deploy to external accounts without authorization.

Suggested commit prefixes:

```text
feat:
fix:
refactor:
test:
docs:
perf:
chore:
```

Version required assets and visual regression baselines.

Include required test reports and profiling evidence using a documented, reproducible delivery mechanism.

Avoid committing unnecessary generated artifacts.

## 23. Parallel Agent Coordination

Use parallel agents or worktrees when available and when tasks are independent.

Suggested ownership boundaries:

| Agent | Responsibility |
|---|---|
| Core | Simulation, entities, movement, collisions, combat |
| Rendering | PixiJS, assets, animations, effects |
| Frontend | React screens, HUD, controls, accessibility |
| Data | Axios, TanStack Query, MSW, persistence |
| QA | Playwright, regression tests, profiling |

Before parallel execution:

- Define shared contracts.
- Define file ownership.
- Identify dependencies.
- Establish integration points.
- Ensure agents do not modify the same files concurrently.

Agents must not independently change shared interfaces without coordination.

The coordinating agent is responsible for integration, resolving conflicts, and validating the complete application.

Parallelism must reduce delivery time, not create additional integration overhead.

## 24. Documentation

Maintain the following files throughout development.

### docs/CHALLENGE.md

Preserve the original challenge specification.

Do not silently modify its requirements.

### docs/REQUIREMENTS.md

Maintain a traceable requirement checklist.

Each entry must include:

- Requirement identifier.
- Description.
- Evaluation category.
- Status.
- Responsible implementation.
- Validation evidence.

Allowed statuses:

- TODO
- IN_PROGRESS
- IMPLEMENTED
- VERIFIED
- BLOCKED

A requirement is only VERIFIED after successful validation.

### docs/ROADMAP.md

Maintain:

- Current phase.
- Priorities.
- Dependencies.
- Progress.
- Pending tasks.
- Risks.
- Blockers.

Update it after meaningful milestones.

### ARCHITECTURE.md

Document:

- Architectural boundaries.
- React and PixiJS integration.
- Simulation lifecycle.
- Input handling.
- Collision algorithms.
- Enemy behavior.
- Resource ownership and cleanup.
- Persistence.
- API contracts.
- Query cache.
- Idempotency.
- Pending registration recovery.
- Testing strategy.
- Balance decisions.
- Trade-offs.
- Known limitations.

### README.md

Include:

- Project overview.
- Public demo URL.
- Setup instructions.
- Environment variables.
- Controls.
- Gameplay configuration.
- Supported mobile orientation.
- Network scenario selection.
- Network reset.
- Development commands.
- Build and preview commands.
- Testing instructions.
- Failure reproduction steps.
- Asset credits and licenses.
- Links to architecture, reports, and performance evidence.

## 25. Deployment

Public deployment is mandatory.

Vercel is the preferred platform.

The published application must:

- Correspond to the submitted source code.
- Work from a clean build.
- Load required assets.
- Initialize MSW correctly.
- Support ranking and history.
- Work after browser refresh.
- Remain accessible during evaluation.
- Not require private external services.

Perform smoke tests against the published URL.

Verify that production asset paths and service worker scope are correct.

Prepare deployment configuration early.

Never invent a deployment URL or claim deployment success before verification.

## 26. Delivery Roadmap

### Phase 0 — Foundation

- Inspect official requirements and assets.
- Initialize project and dependencies.
- Establish architecture.
- Create requirement checklist.
- Configure development tools.
- Validate initial build.

### Phase 1 — Playable Core

- Simulation.
- Player controls.
- Arena.
- Collisions.
- Weapons.
- Enemy behavior.
- Spawning.
- Scoring.
- Match lifecycle.
- Basic rendering.

Deliver a playable vertical slice early.

### Phase 2 — Game Experience

- Final asset integration.
- Visual effects.
- Menus.
- Options.
- HUD.
- Pause.
- Results.
- Mobile controls.
- Accessibility.

### Phase 3 — Data Integration

- Shared REST contracts.
- Axios.
- TanStack Query.
- MSW.
- Ranking.
- Match history.
- Failure scenarios.
- Idempotency.
- Persistent outbox.

### Phase 4 — Validation

- Gameplay tests.
- Lifecycle tests.
- Network tests.
- Mobile tests.
- Visual regression.
- Bug fixes.

Testing should also happen during earlier phases.

### Phase 5 — Delivery

- Production build.
- Performance profiling.
- Memory investigation.
- Documentation.
- Public deployment.
- Final smoke tests.
- Requirement audit.

When time becomes limited, prioritize mandatory behavior and delivery blockers over optional polish.

Do not defer deployment until the final minutes.

## 27. Definition of Done

A task is complete only when:

- Its requirements are implemented.
- It is integrated into the real application.
- Relevant failure cases are handled.
- Applicable tests pass.
- Type checking passes.
- Linting passes.
- The application remains buildable.
- Resource ownership and cleanup are correct.
- Documentation is updated where necessary.
- The requirement checklist reflects actual verification status.

A partially implemented feature must not be represented as complete.

## 28. Reporting

After completing a meaningful milestone, report:

1. Implemented functionality.
2. Important architectural decisions.
3. Files or modules changed.
4. Commands actually executed.
5. Test and build results.
6. Remaining requirements.
7. Known limitations and blockers.
8. Next recommended task.

Keep reports concise and factual.

Do not repeat the entire project context in every report.

## 29. Final Instructions

The official challenge specification takes precedence over convenience.

Build the smallest architecture that satisfies the complete problem.

A polished interface cannot compensate for broken gameplay.

Passing tests cannot compensate for missing requirements.

Documentation cannot compensate for nonexistent implementations.

Prioritize correctness, reproducibility, maintainability, and delivery.

When uncertain, inspect the existing code, verify assumptions, implement the simplest valid solution, and validate it with real execution.