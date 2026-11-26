import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cpus, platform, release, totalmem } from 'node:os';
import { createHash } from 'node:crypto';
import { URL, fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import process from 'node:process';
import console from 'node:console';

// Run against an optimized preview: node scripts/profile.mjs
// This script never advances the simulation clock or changes gameplay state.
const baseURL = process.env.PROFILE_URL ?? 'http://127.0.0.1:4173';
const headless = process.env.PROFILE_HEADFUL !== '1';
const viewport = { width: 1440, height: 900 };
const outputDirectory = new URL('../docs/evidence/', import.meta.url);
const outputFile = new URL('profile.json', outputDirectory);
const keys = ['w', 'd', 'Space', 'q', 'e'];
const started = Date.now();
let browser;
let page;
let cdp;
const errors = [];
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  status: 'running',
  productionURL: baseURL,
  sourceCommit: null,
  environment: {
    platform: platform(), osRelease: release(), cpu: cpus()[0]?.model,
    logicalCPUs: cpus().length, physicalMemoryBytes: totalmem(),
    browserMode: headless ? 'headless' : 'headful', viewport,
    deviceScaleFactor: 1,
  },
  gameplay: { seed: 42, duration: 180, spawnInterval: 15, heldKeys: keys, manualAdvancementUsed: false },
  combat: null,
  memory: { warmCacheBaseline: null, cycles: [], finalHeap: null },
  errors,
  limitations: [
    'One desktop Chromium environment and a sparse 15-second spawn interval; not a guarantee for mobile or maximum-density combat.',
    'The test URL is used only for read-only snapshots, metrics and switching to the real ticker. No calls to advance() are made.',
    'A requestAnimationFrame observer clones simulation state once per frame to capture the terminal state before UI disposal; its overhead is included.',
    'Pixi FPS is frame count / accumulated elapsed milliseconds; P95 uses its first 15000 running frame intervals.',
    'Forced V8 GC and DOM/heap counters do not measure total process RSS or GPU memory. Shared asset textures intentionally remain cached.',
    'Production minification can rename constructors, so absence of a named heap object does not prove its resources are absent.',
    'Headless browser scheduling and the reported GPU backend may differ from interactive physical-device performance.',
  ],
};

async function persist() {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, JSON.stringify(report, null, 2) + '\n');
}

async function pressControls() {
  for (const key of keys) await page.keyboard.down(key);
}
async function releaseControls() {
  for (const key of keys) await page.keyboard.up(key);
}
async function startMatch() {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => Boolean(globalThis.__pirateTest));
  await page.getByRole('button', { name: 'Forward', exact: true }).waitFor({ state: 'visible' });
  const status = await page.evaluate(() => globalThis.__pirateTest.snapshot().status);
  if (status === 'paused') await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByTestId('arena').click();
  await pressControls();
}

async function memoryCounters(label) {
  await cdp.send('HeapProfiler.collectGarbage');
  const [performance, dom, heap, document] = await Promise.all([
    cdp.send('Performance.getMetrics'), cdp.send('Memory.getDOMCounters'),
    cdp.send('Runtime.getHeapUsage'),
    page.evaluate(() => ({ canvases: globalThis.document.querySelectorAll('canvas').length, testAPIExposed: Boolean(globalThis.__pirateTest) })),
  ]);
  return { label, performance: Object.fromEntries(performance.metrics.map(metric => [metric.name, metric.value])), dom, heap, document };
}

async function heapSummary(label) {
  const chunks = [];
  const collect = ({ chunk }) => chunks.push(chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', collect);
  try {
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', collect);
  }
  const serialized = chunks.join('');
  if (process.env.PROFILE_SAVE_HEAPS === '1') {
    const directory = new URL('../test-results/profile/', import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL(`${label}.heapsnapshot`, directory), serialized);
  }
  const heap = JSON.parse(serialized);
  const fields = heap.snapshot.meta.node_fields;
  const width = fields.length;
  const nameIndex = fields.indexOf('name');
  const typeIndex = fields.indexOf('type');
  const sizeIndex = fields.indexOf('self_size');
  const types = heap.snapshot.meta.node_types[typeIndex];
  const relevant = /^(Application|GameSimulation|BattleRenderer|Ticker|Container|Sprite|Texture|HTMLCanvasElement|HTMLAudioElement|AudioContext|WebGLRenderingContext|WebGL2RenderingContext)$/;
  const resources = {};
  let objects = 0;
  let selfSize = 0;
  for (let index = 0; index < heap.nodes.length; index += width) {
    const type = types[heap.nodes[index + typeIndex]];
    const name = heap.strings[heap.nodes[index + nameIndex]];
    selfSize += heap.nodes[index + sizeIndex];
    if (type === 'object' || type === 'native') {
      objects++;
      if (relevant.test(name)) {
        resources[name] ??= { count: 0, shallowBytes: 0 };
        resources[name].count++;
        resources[name].shallowBytes += heap.nodes[index + sizeIndex];
      }
    }
  }
  return { label, totalNodes: heap.nodes.length / width, objectAndNativeNodes: objects, totalShallowBytes: selfSize, namedResourceCounts: resources, rawSnapshotSaved: process.env.PROFILE_SAVE_HEAPS === '1' };
}

const watchdog = globalThis.setTimeout(() => {
  errors.push('Overall profiling deadline exceeded (9 minutes).');
  void browser?.close();
}, 540000);

try {
  await mkdir(outputDirectory, { recursive: true });
  try {
    report.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
    report.sourceDirtyPaths = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', windowsHide: true }).trim().split('\n').filter(Boolean);
  } catch { report.limitations.push('A source commit could not be read; bind this evidence to the delivered source manually.'); }
  try { report.environment.hostHardware = JSON.parse(await readFile(new URL('hardware.json', outputDirectory), 'utf8')); }
  catch { report.limitations.push('Optional hardware.json was unavailable; Node OS/CPU/RAM and browser GPU metadata are included instead.'); }
  const gpuArguments = process.env.PROFILE_GPU === 'd3d11' ? ['--enable-gpu', '--use-angle=d3d11'] : [];
  report.environment.launchArguments = gpuArguments;
  browser = await chromium.launch({ headless, args: gpuArguments });
  report.environment.browserVersion = browser.version();
  const browserCDP = await browser.newBrowserCDPSession();
  try { report.environment.gpu = (await browserCDP.send('SystemInfo.getInfo')).gpu; }
  catch (error) { report.limitations.push(`GPU metadata unavailable: ${error.message}`); }
  await browserCDP.detach();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  const response = await page.goto(`${baseURL}/?test=1`, { waitUntil: 'networkidle', timeout: 30000 });
  if (!response?.ok()) throw new Error('Production preview did not return a successful document');
  const html = await response.text();
  if (html.includes('/@vite/client')) throw new Error('Refusing to profile the development server; build and use preview');
  report.productionDocumentSHA256 = createHash('sha256').update(html).digest('hex');
  report.environment.browser = await page.evaluate(() => ({
    userAgent: globalThis.navigator.userAgent,
    devicePixelRatio: globalThis.devicePixelRatio,
    screen: { width: globalThis.screen.width, height: globalThis.screen.height },
    scriptURLs: Array.from(globalThis.document.scripts, script => script.src),
  }));
  await page.getByRole('button', { name: 'Options', exact: true }).first().click();
  await page.getByLabel('Game session time').fill('180');
  await page.getByLabel('Enemy spawn time').fill('15');
  await page.getByRole('button', { name: 'Save Options' }).click();
  await startMatch();

  await page.evaluate(() => {
    let api = globalThis.__pirateTest;
    if (!api) throw new Error('No game instrumentation available');
    const profile = { samples: [], final: null, current: null, stopped: false, startedAt: globalThis.performance.now() };
    globalThis.__pirateProfile = profile;
    let nextSample = 0;
    const observe = () => {
      if (!api || profile.stopped) return;
      const state = api.snapshot();
      const wallTimeMs = globalThis.performance.now() - profile.startedAt;
      profile.current = { time: state.time, status: state.status, hp: state.player.hp, score: state.score, wallTimeMs };
      if (wallTimeMs >= nextSample || state.reason !== null) {
        const sample = { ...profile.current, reason: state.reason, enemies: state.enemies.length, projectiles: state.projectiles.length, effects: state.effects.length, ...api.metrics() };
        profile.samples.push(sample);
        nextSample = wallTimeMs + 1000;
        if (state.reason !== null) {
          profile.final = { ...sample, capturedBeforeViewDisposal: state.status === 'ended' };
          api = null;
          return;
        }
      }
      globalThis.requestAnimationFrame(observe);
    };
    // Start the Pixi callback first so each observer runs after that frame's real tick.
    api.setManualClock(false);
    globalThis.requestAnimationFrame(observe);
  });

  console.log('Production combat started: 180 active seconds, seed42, spawn15, real keyboard controls.');
  let lastProgress = -1;
  const combatDeadline = Date.now() + 300000;
  while (Date.now() < combatDeadline) {
    await sleep(1000);
    const progress = await page.evaluate(() => ({ current: globalThis.__pirateProfile.current, finished: Boolean(globalThis.__pirateProfile.final) }));
    const bucket = Math.floor((progress.current?.time ?? 0) / 30);
    if (bucket !== lastProgress) {
      console.log(`Combat ${progress.current?.time.toFixed(1) ?? 0}s / 180s, HP ${progress.current?.hp ?? '?'}`);
      lastProgress = bucket;
    }
    if (progress.finished) break;
    if (progress.current?.status === 'paused') {
      report.limitations.push(`Automatic focus pause at ${progress.current.time.toFixed(2)} active seconds; resumed via the real Resume control.`);
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await page.getByTestId('arena').click();
      await pressControls();
    }
  }
  report.combat = await page.evaluate(() => {
    const profile = globalThis.__pirateProfile;
    profile.stopped = true;
    const copy = { samples: profile.samples, final: profile.final, wallDurationMs: globalThis.performance.now() - profile.startedAt };
    delete globalThis.__pirateProfile;
    return copy;
  });
  await releaseControls();
  if (!report.combat.final) throw new Error('Combat did not reach a terminal state within the bounded real-time deadline');
  await page.getByRole('button', { name: 'Play Again', exact: true }).waitFor();
  report.completedRecord = await page.evaluate(() => JSON.parse(globalThis.localStorage.getItem('pirate-battle.last.v1') ?? 'null'));
  await page.screenshot({ path: fileURLToPath(new URL('profile-result.png', outputDirectory)), fullPage: true });
  report.combat.requiredThreeMinuteMatchCompleted = report.combat.final.reason === 'time' && report.combat.final.time === 180 && report.combat.final.hp > 0;
  console.log(`Combat finished: ${report.combat.final.reason}, ${report.combat.final.time}s, ${report.combat.final.fps.toFixed(1)} FPS, P95 ${report.combat.final.p95FrameMs.toFixed(2)}ms.`);
  await persist();
  await page.getByRole('button', { name: 'Main Menu', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__pirateTest && globalThis.document.querySelectorAll('canvas').length === 0);
  report.memory.warmCacheBaseline = await memoryCounters('warm-cache-before-five-cycles');
  report.memory.baselineHeap = await heapSummary('baseline');
  await persist();

  for (let cycle = 1; cycle <= 5; cycle++) {
    console.log(`Memory cycle ${cycle}/5: real 20-second play, then abandon and collect garbage.`);
    await startMatch();
    await page.evaluate(() => globalThis.__pirateTest.setManualClock(false));
    await page.waitForFunction(() => {
      const state = globalThis.__pirateTest?.snapshot();
      return state && (state.time >= 20 || state.status !== 'running');
    }, undefined, { timeout: 45000 });
    const active = await page.evaluate(() => {
      const api = globalThis.__pirateTest;
      const state = api.snapshot();
      return { time: state.time, status: state.status, hp: state.player.hp, ...api.metrics() };
    });
    await releaseControls();
    if (active.status !== 'running' || active.time < 20) throw new Error(`Memory cycle ${cycle} did not complete 20 active seconds`);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Abandon Match', exact: true }).click();
    await page.waitForFunction(() => !globalThis.__pirateTest && globalThis.document.querySelectorAll('canvas').length === 0);
    const afterExit = await memoryCounters(`after-cycle-${cycle}`);
    report.memory.cycles.push({ cycle, active, afterExit });
    await persist();
  }
  report.memory.finalHeap = await heapSummary('after-five-cycles');
  const heaps = [report.memory.warmCacheBaseline.heap.usedSize, ...report.memory.cycles.map(cycle => cycle.afterExit.heap.usedSize)];
  report.memory.analysis = {
    usedHeapBytesAfterGC: heaps,
    finalMinusWarmBaselineBytes: heaps.at(-1) - heaps[0],
    monotonicallyIncreasing: heaps.every((value, index) => index === 0 || value > heaps[index - 1]),
    allActiveSessionsHaveSingleCanvasAndBinding: report.memory.cycles.every(cycle => cycle.active.activeCanvases === 1 && cycle.active.activeInputBindings === 1),
    allExitsRemoveCanvasAndTestAPI: report.memory.cycles.every(cycle => cycle.afterExit.document.canvases === 0 && !cycle.afterExit.document.testAPIExposed),
  };
  report.status = report.combat.requiredThreeMinuteMatchCompleted && errors.length === 0 ? 'completed' : 'completed-with-limitations';
  console.log(`Five memory cycles completed. Heap delta ${report.memory.analysis.finalMinusWarmBaselineBytes} bytes; evidence saved.`);
} catch (error) {
  report.status = 'failed';
  errors.push(error instanceof Error ? error.stack ?? error.message : String(error));
  console.error(`Profiling failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  globalThis.clearTimeout(watchdog);
  report.finishedAt = new Date().toISOString();
  report.totalWallTimeMs = Date.now() - started;
  await persist();
  await browser?.close();
}
