# Required accessibility verification

Scope: the specific requirements in challenge section 7, implemented on 2026-11-25 and verified in Chromium desktop and Pixel 7 emulation. This is not a claim of complete WCAG conformance or a physical screen-reader/device certification.

## Corrections

- Options validation now associates the error with both inputs through `aria-describedby` and identifies invalid values through `aria-invalid`. Storage errors remain announced as alerts.
- The HUD exposes named score and remaining-time groups, a labelled health meter, and a separate lifecycle status. Only lifecycle transitions change the status announcement; continuously changing score/time are outside live regions.
- The network disclosure has an explicit visible keyboard focus outline.
- The background overlay was darkened after measured desktop menu text contrast failed: 3.97:1 for the masthead tagline, 2.93:1 for the compass label, 2.54:1 for the ship tagline, and 3.05:1 / 2.94:1 for the explanatory text. These normal-sized texts require 4.5:1.
- The results footer now uses the existing muted-text color after a mobile measurement of 3.99:1 failed the same threshold.

## Browser verification

`tests/e2e/accessibility.spec.ts` checks keyboard entry and activation, visible focus, initial dialog focus, focus trapping/restoration, labelled forms, associated invalid-value messages, normal arrow-key editing outside gameplay, and semantic health/score/time/lifecycle information. Existing `resources.spec.ts` covers pause activation without firing, safe focus restoration and input disposal.

Contrast checks measure the rendered background in full-page screenshots, with text temporarily made transparent. They compare computed text colors with sampled background pixels, including gradients and artwork, using 4.5:1 for normal text and 3:1 for large text. Open modal tests examine the active dialog rather than the inert page beneath its backdrop. Measurements cover menu, expanded network settings, options, invalid options, ranking, empty history, combat, pause and confirmed results in both browser configurations.

The measured samples are archived under [evidence/accessibility](evidence/accessibility). Image baselines were updated only for the intended background/footer corrections; gameplay rendering is unchanged.

## Reproduce and limits

The tests wait for the mounted interface and font loading before recording geometry or issuing the first Tab. This prevents early input and fallback-font measurements during MSW startup.

Run `npx playwright test tests/e2e/accessibility.spec.ts tests/e2e/resources.spec.ts`. The HTML report contains contrast measurements per state. These tests check the browser accessibility semantics and keyboard behavior, not actual spoken output from NVDA/VoiceOver. Pixel sampling is a contrast regression check for these views and viewports, not proof for every possible backdrop, state or device. Physical mobile testing remains additional validation beyond the required Chromium mobile flows.

## Final execution

On 2026-11-26 the complete optimized-build suite passed 53 tests, with one intentional desktop multitouch duplicate skipped. All four dedicated accessibility cases passed in desktop/mobile. The lowest recorded text contrast across the 18 state reports was 4.59:1. See the [complete browser report](evidence/browser-report/index.html).
