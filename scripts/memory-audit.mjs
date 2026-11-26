import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import process from "node:process";
import console from "node:console";
import { analyzeHeap } from "./heap-analysis.mjs";

const url = process.env.PROFILE_URL ?? "http://127.0.0.1:4173";
const cycles = Number(process.env.MEMORY_CYCLES ?? 15);
if (!Number.isInteger(cycles) || cycles < 5 || cycles > 30)
  throw new Error("MEMORY_CYCLES must be an integer from 5 to 30");
const name = process.env.MEMORY_REPORT ?? "memory-audit";
if (!/^[a-z-]+$/.test(name))
  throw new Error(
    "MEMORY_REPORT must contain only lowercase letters and hyphens",
  );
const report = {
  startedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  url,
  status: "running",
  cycles: [],
  snapshots: [],
  errors: [],
};
const browser = await chromium.launch({
  args: ["--enable-gpu", "--use-angle=d3d11"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
let baselineIds = new Set();
await mkdir("docs/evidence", { recursive: true });
const persist = () =>
  writeFile(
    `docs/evidence/${name}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
page.on("pageerror", (error) => report.errors.push(error.message));
async function snapshot(label) {
  await cdp.send("HeapProfiler.collectGarbage");
  const chunks = [];
  const listener = ({ chunk }) => chunks.push(chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", listener);
  try {
    await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  } finally {
    cdp.off("HeapProfiler.addHeapSnapshotChunk", listener);
  }
  const serialized = chunks.join("");
  await writeFile(`docs/evidence/${name}-${label}.heapsnapshot`, serialized);
  const analyzed = analyzeHeap(JSON.parse(serialized), baselineIds);
  if (!baselineIds.size) baselineIds = analyzed.ids;
  report.snapshots.push({ label, ...analyzed.summary });
  await persist();
}
try {
  report.browser = browser.version();
  const response = await page.goto(`${url}/?test=1`);
  const html = await response.text();
  if (!response.ok() || html.includes("/@vite/client"))
    throw new Error("An optimized preview is required");
  report.documentSHA256 = createHash("sha256").update(html).digest("hex");
  await page
    .getByRole("button", { name: "Options", exact: true })
    .first()
    .click();
  await page.getByLabel("Game session time").fill("180");
  await page.getByLabel("Enemy spawn time").fill("15");
  await page.getByRole("button", { name: "Save Options" }).click();
  for (let cycle = 0; cycle <= cycles; cycle++) {
    console.log(
      `Memory audit ${cycle === 0 ? "warm-up" : `cycle ${cycle}/${cycles}`}: 20 real active seconds`,
    );
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => Boolean(globalThis.__pirateTest));
    if (
      await page
        .getByRole("button", { name: "Resume", exact: true })
        .isVisible()
    )
      await page.getByRole("button", { name: "Resume", exact: true }).click();
    await page.getByTestId("arena").click();
    for (const key of ["w", "d", "Space", "q", "e"])
      await page.keyboard.down(key);
    await page.evaluate(() => globalThis.__pirateTest.setManualClock(false));
    await page.waitForFunction(
      () => globalThis.__pirateTest?.snapshot().time >= 20,
      undefined,
      { timeout: 45000 },
    );
    const active = await page.evaluate(() => ({
      metrics: globalThis.__pirateTest.metrics(),
      time: globalThis.__pirateTest.snapshot().time,
    }));
    for (const key of ["w", "d", "Space", "q", "e"])
      await page.keyboard.up(key);
    if (cycle === 0) await snapshot("active-signature-calibration");
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page
      .getByRole("button", { name: "Abandon Match", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        !globalThis.__pirateTest &&
        globalThis.document.querySelectorAll("canvas").length === 0,
    );
    // Flush two rendered frames so React passive cleanup and released handlers settle.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          globalThis.requestAnimationFrame(() =>
            globalThis.requestAnimationFrame(resolve),
          ),
        ),
    );
    await cdp.send("HeapProfiler.collectGarbage");
    report.cycles.push({
      cycle,
      active,
      heap: await cdp.send("Runtime.getHeapUsage"),
      dom: await cdp.send("Memory.getDOMCounters"),
    });
    if (cycle === 0) {
      baselineIds = new Set();
      await snapshot("warm-baseline");
    }
    if (cycle > 0 && (cycle % 5 === 0 || cycle === cycles))
      await snapshot(`after-${cycle}`);
    await persist();
  }
  // A page GC cannot collect the separate service-worker heap. Compare ports after
  // collecting that heap too, without disabling MSW or changing gameplay.
  const browserCDP = await browser.newBrowserCDPSession();
  const { targetInfos } = await browserCDP.send("Target.getTargets");
  report.workerCollections = [];
  for (const target of targetInfos.filter(
    (target) => target.type === "service_worker" && target.url.startsWith(url),
  )) {
    const { sessionId } = await browserCDP.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: false,
    });
    await new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        browserCDP.off("Target.receivedMessageFromTarget", listener);
        reject(new Error("Worker GC timed out"));
      }, 10000);
      const listener = (event) => {
        const message = JSON.parse(event.message);
        if (event.sessionId !== sessionId || message.id !== 1) return;
        globalThis.clearTimeout(timeout);
        browserCDP.off("Target.receivedMessageFromTarget", listener);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve();
      };
      browserCDP.on("Target.receivedMessageFromTarget", listener);
      browserCDP
        .send("Target.sendMessageToTarget", {
          sessionId,
          message: JSON.stringify({
            id: 1,
            method: "HeapProfiler.collectGarbage",
          }),
        })
        .catch(reject);
    });
    report.workerCollections.push(target.url);
    await browserCDP.send("Target.detachFromTarget", { sessionId });
  }
  await browserCDP.detach();
  await snapshot("after-worker-gc");
  report.afterWorkerGC = {
    heap: await cdp.send("Runtime.getHeapUsage"),
    dom: await cdp.send("Memory.getDOMCounters"),
  };
  const warm = report.snapshots.find(
    (snapshot) => snapshot.label === "warm-baseline",
  );
  const final = report.snapshots.at(-1);
  const ports = (snapshot) =>
    snapshot.diagnosticResources.find(
      (resource) => resource.key === "native: MessagePort",
    )?.count ?? 0;
  report.resourceChecks = {
    activeSignaturesDetected: [
      "simulation",
      "battleRenderer",
      "battleAudio",
      "pixiApplication",
    ].every((key) => report.snapshots[0].resourceSignatures[key].count === 1),
    sessionResourcesReleased: [
      "battleRenderer",
      "battleAudio",
      "pixiApplication",
    ].every((key) => final.resourceSignatures[key].count === 0),
    simulationCountBounded:
      final.resourceSignatures.simulation.count <=
      warm.resourceSignatures.simulation.count,
    diagnosticPortsBounded: ports(final) <= ports(warm) + 4,
  };
  if (Object.values(report.resourceChecks).some((value) => !value)) {
    report.errors.push(
      "Resource regression detected; inspect resourceChecks and retaining paths.",
    );
    process.exitCode = 1;
  }
  report.status = report.errors.length ? "completed-with-errors" : "completed";
} catch (error) {
  report.status = "failed";
  report.errors.push(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await persist();
  await browser.close();
}
