# Delivery roadmap

Updated 2026-11-26. The original estimate was two working days. The currently published game remains available at https://pirate-battle-ivory.vercel.app; runtime revision is `4771d73`. Changes are delivered in independently reviewable commits, and runtime updates are published only after applicable checks pass.

## Current status

| Phase                      | Status                               | Evidence / remaining scope                                                                                                        |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 0 Discovery and foundation | Verified                             | Original specification and supplied assets preserved; strict TypeScript and build tooling pass                                    |
| 1 Core gameplay            | Verified spawning follow-up    | Movement, combat, collisions, AI and lifecycle tests pass; G14 verifies cap removal, safe fallback and deferred blocked arrivals                |
| 2 Rendering and experience | Verified for recorded scope          | Pixi rendering, six visual baselines, desktop/mobile layout, multitouch and required accessibility checks pass                    |
| 3 Remote data              | Verified                             | Axios/MSW/TanStack Query, pagination, failure states, persistent outbox and timeout idempotency tests pass                        |
| 4 Quality assurance        | Verified for recorded scope          | 42 unit tests; 53 optimized-build browser tests passed, one intentional desktop-only duplicate skipped                            |
| 5 Delivery                 | Published; final handoff checks open | 24 public checks passed; profiling and reports versioned; public GitHub repository available; clean-checkout validation remains |

## Ordered final handoff

1. Reconcile documentation and publish the solution repository for evaluator access. Documentation describes completed evidence and actual limits without obsolete pending claims.
2. Correct and verify continuous safe spawning without disturbing the published working version.
3. Perform installation, build and browser verification from a separate clean checkout.

The original Jungle Gaming repository must remain unchanged. Publication is authorized only for the project owner's solution repository/account.

## Current evidence

Typecheck, lint, production build and 42 unit tests passed on 2026-11-26. The optimized browser suite passed 53 cases, with one desktop multitouch duplicate intentionally skipped because actual multitouch is exercised in the mobile project. All 24 public desktop/mobile checks passed. Reports are linked in README and in `docs/evidence`.

A real 180-second optimized match measured 59.97 FPS / 16.70 ms P95 on RTX 3060 and 15.37 FPS with SwiftShader. A 15-cycle heap investigation identified retained MSW diagnostic response streams; the corrected five-cycle run holds native MessagePorts at 2 instead of 524. Retaining paths classify shared Pixi resources, disposed React props, V8 compilation and DevTools network history. See PERFORMANCE.md and ACCESSIBILITY.md for measurement scope.

Physical devices, spoken screen-reader output, OS-level visibility changes and GPU-memory/RSS measurements are additional evidence limits. The separate clean checkout remains a required final check, not a completed measurement.

## Historical milestones

- **2026-11-24:** playable foundation and first 14 browser cases; initial baseline generation was not yet complete regression evidence.
- **2026-11-25:** expanded local suite reached 49 passed / one intentional skip; first public deployment passed 20 checks; optimized profiling completed.
- **2026-11-26:** required accessibility and memory follow-up completed; current suite reached 53 passed / one intentional skip and public validation reached 24 passed. These results supersede the earlier partial milestones.

The supplied assets originate from upstream commit `315891441be81ca0bff75cf3c2b0cd2f27f119cd`. Original assets are preserved; the reference checkout is ignored.

## Safe-spawn correction

The correction is developed in an isolated worktree while the public demo, GitHub master and delivery-ready-2026-11-26 tag retain the verified previous runtime. The arbitrary 36-enemy cap is removed. Safe fallback and queued blocked arrivals are tested; 46 unit cases pass, including 179 simultaneous stationary enemies and backward compatibility for previous capped match records. The final clean-checkout check remains the last planned step.

The isolated spawn correction passed typecheck, lint, build, all 46 unit tests and all 53 browser checks (one intentional skip), including unchanged visual baselines. It is ready for promotion; clean-checkout verification remains last.
