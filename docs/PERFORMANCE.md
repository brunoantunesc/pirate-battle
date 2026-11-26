# Production performance and memory evidence

Measured on 2026-11-25 against an optimized Vite preview of gameplay commit `d35751401d754dae038b81224ff4e64b6d432cfe`. Raw observations are preserved in [GPU profile](evidence/profile.json), [software profile](evidence/profile-software.json), and [hardware](evidence/hardware.json). These are measurements, not estimated targets.

## Environment and method

- Windows 11 Home 10.0.26300; AMD Ryzen 5 5600 (6 cores/12 threads), approximately 32 GiB RAM; NVIDIA RTX 3060, driver 32.0.16.1088.
- Chromium 159.0.8154.6, headless, viewport 1440x900, devicePixelRatio 1; logical arena 1200x720 and Pixi resolution 1.
- GPU run explicitly enabled GPU and ANGLE Direct3D11. Browser metadata confirms the RTX 3060 backend. The default headless run used SwiftShader software rendering despite the installed GPU.
- Real 180-second match, seed 42, spawn interval 15 seconds, default balance otherwise. Actual W/D/Space/Q/E keyboard holds were used. No manual clock advancement, artificial health, suppressed collisions, or assigned scores.
- The normal production ticker advanced gameplay. A read-only rAF observer sampled state and captured the terminal tick before UI disposal; its overhead is included. Background host activity was not strictly isolated.

## Three-minute results

| Backend               | Active time | Frames | Mean FPS | P95 frame interval | Maximum entities | Result                          |
| --------------------- | ----------: | -----: | -------: | -----------------: | ---------------: | ------------------------------- |
| RTX 3060 / Direct3D11 |        180s |  10795 |    59.97 |            16.70ms |               24 | Time completed; 22 HP; 8 points |
| SwiftShader software  |        180s |   2777 |    15.37 |            83.40ms |               24 | Time completed; 22 HP; 8 points |

The 60 FPS target is met to normal frame-timing precision in this GPU configuration. It is NOT met in the software-rendered configuration. This sparse legal spawn configuration does not establish performance at the default 3-second spawn interval, maximum enemy density, high DPR, or on physical mobile hardware. No general 60 FPS guarantee is claimed.

## Five start/play/exit cycles

Each cycle played 20 active seconds using the real ticker and inputs, then paused, abandoned and collected V8 garbage. A warm-cache baseline and final heap snapshot were parsed, with CDP DOM and heap counters recorded after each exit.

| GPU run stage | JS heap after GC (bytes) | DOM nodes | DOM listeners | Mounted canvases |
| ------------- | -----------------------: | --------: | ------------: | ---------------: |
| Warm baseline |                  8401152 |       267 |           204 |                0 |
| Cycle1        |                  8633864 |       243 |           200 |                0 |
| Cycle2        |                  8825892 |       321 |           207 |                0 |
| Cycle3        |                  8791936 |       243 |           200 |                0 |
| Cycle4        |                  8977140 |       321 |           207 |                0 |
| Cycle5        |                  9036964 |       321 |           207 |                0 |

Every active session had exactly one instrumented canvas and one input binding. Every exit removed the mounted canvas and test API. Native heap counts remained unchanged: 2 HTMLCanvasElement objects, 2 WebGLRenderingContext objects, 1 WebGL2RenderingContext object, including shared renderer/asset resources outside the mounted canvas. No accumulated native canvas/context count was observed.

Heap increased 635812 bytes (about 621 KiB) from the GPU warm baseline and was not monotonically increasing. DOM/listener counts oscillated within two observed levels rather than growing each cycle. The software run increased 609316 bytes monotonically, while DOM/listener counts and native graphics counts stayed constant. These observations do not prove a leak-free heap: runtime caches, framework work and instrumentation may contribute; minification obscures application constructor names, and retaining paths were not fully classified. GPU allocation and process RSS were not measured. A longer plateau/retainer investigation remains an explicit limitation, not a hidden pass.

## Reproduce

1. `npm ci` and `npm run build`.
2. `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173`.
3. In PowerShell: `$env:PROFILE_GPU='d3d11'; npm run profile`. Omit PROFILE_GPU for the default software/headless comparison on this environment.
4. The script runs the real match and five 20-second cycles, prints progress, and writes `docs/evidence/profile.json` and its result image. Preserve previous files before rerunning.
5. Set PROFILE_SAVE_HEAPS=1 to save full snapshots under ignored test-results/profile for deeper retaining-path analysis. PROFILE_HEADFUL=1 allows an interactive-browser comparison. PROFILE_URL can target an optimized preview elsewhere.

The script rejects a Vite development document, records source revision/build-document hash/browser/GPU/configuration, and records failed or partial runs honestly. It does not declare an early death to be a completed three-minute measurement. Large raw heap files are excluded from Git; parsed counts and raw frame samples are versioned.
