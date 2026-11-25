# Delivery roadmap

Estimate: two working days. Prioritize gameplay, renderer lifecycle and readable combat, followed by data consistency and test evidence.

| Phase | Dependencies | Status | Exit evidence |
|---|---|---|---|
| 0 Discovery and foundation | Public upstream | In progress | Original statement copied, assets inspected, tools installed; first build pending |
| 1 Core gameplay | Typed contracts | In progress | Pure seeded simulation and unit tests being implemented |
| 2 Rendering and experience | Simulation contract | In progress | Pixi renderer and React screens being integrated |
| 3 Remote data | Match contract | In progress | MSW handlers, outbox and query hooks being implemented |
| 4 Quality assurance | Integrated build | Pending | Desktop/mobile E2E, visual baselines, HTML report |
| 5 Delivery | Passing checks | Pending | Optimized profiling, memory investigation, authorized public deployment |

Parallel ownership: simulation agent owns config/simulation/unit tests; rendering agent owns renderer/input/canvas/audio; data agent owns api/mocks/records/network panel; primary owns project configuration, UI integration, E2E, documentation and git.

Risks: graphics support in automated browser; dependency download permissions; real three-minute profiling requires a reference environment; public deployment requires user authorization and destination. No remote repository changes are authorized.

Asset discovery: official source commit `315891441be81ca0bff75cf3c2b0cd2f27f119cd`. UI atlas provides frames, anchors, nine-slice borders and logical content rectangles. Ship atlas is XML. Tiles are 64 px without spacing. Individual default/retina PNGs avoid atlas conversion. WAV audio and reference images are present. Original assets are copied without alteration; upstream checkout is ignored.

## Verified playable milestone — 2026-11-24

Foundation and playable core are integrated. Production build and type checking passed. The expanded browser suite passed 14 cases across desktop and mobile while generating six visual baselines. Baseline comparison is being confirmed separately. Core has 23 unit cases and data has 19. Full coverage of all twelve official groups remains unfinished. Next: complete gameplay/network E2E coverage, profile a production three-minute match and five lifecycle cycles, then authorize and validate public deployment. The current bundle emits a size warning; no performance claim is made.


Follow-up: baseline comparison run was interrupted after a desktop combat timeout. The preceding snapshot-generation run passed all 14 cases. Browser repeatability remains IN_PROGRESS; do not interpret initial baseline generation as regression approval.


## Coverage milestone — 2026-11-25

Full Playwright suite: 49 passed, 1 intentional desktop multitouch duplicate skipped, in 2.5 minutes. Six existing visual baselines matched without updates. All twelve official groups now have browser evidence mapped in COVERAGE-AUDIT.md. Unit suite:42 passed. Typecheck, lint and production build passed; bundle-size warning remains. Fixed storage quota completion and dialog keyboard/focus issues. Visibility is an emulated browser signal; actual OS visibility smoke, heap/GPU profiling, 180-second FPS measurement and public deployment remain outstanding.

