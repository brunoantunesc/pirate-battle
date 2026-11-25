import { expect, test, type Locator, type Page } from "@playwright/test";

async function start(page: Page) {
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__pirateTest));
  await expect(
    page.getByRole("button", { name: "Forward", exact: true }),
  ).toBeEnabled();
}

async function abandon(page: Page) {
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page
    .getByRole("button", { name: "Abandon Match", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => typeof window.__pirateTest))
    .toBe("undefined");
}

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Touch control has no layout box.");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("five start-play-exit cycles retain one canvas and one input binding", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?test=1");
  for (let cycle = 0; cycle < 5; cycle++) {
    await start(page);
    await expect(page.locator("canvas")).toHaveCount(1);
    const metrics = await page.evaluate(() => window.__pirateTest!.metrics());
    expect(metrics.activeCanvases).toBe(1);
    expect(metrics.activeInputBindings).toBe(1);
    await page.keyboard.down("w");
    await page.keyboard.down("q");
    await page.evaluate(() => window.__pirateTest!.advance(0.25));
    await page.keyboard.up("w");
    await page.keyboard.up("q");
    expect(
      await page.evaluate(
        () => window.__pirateTest!.snapshot().projectiles.length,
      ),
    ).toBe(3);
    await abandon(page);
  }
  await expect(
    page.getByRole("button", { name: /View Last Result/ }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("abandoning during asset loading cannot mount a stale canvas", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const assetPattern = "**/assets/png/default/ships/ship_2.png";
  let markRequested: () => void = () => {};
  const requested = new Promise<void>(resolve => { markRequested = resolve; });
  let markDelivered: () => void = () => {};
  const delivered = new Promise<void>(resolve => { markDelivered = resolve; });
  await context.route(assetPattern, async (route) => {
    markRequested();
    await gate;
    await route.continue();
    markDelivered();
  });
  await page.goto("/?test=1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await requested;
  await expect(page.getByText("Preparing the fleet…")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Forward", exact: true }),
  ).toBeDisabled();
  await abandon(page);
  release();
  await delivered;
  await context.unroute(assetPattern);
  await start(page);
  const metrics = await page.evaluate(() => window.__pirateTest!.metrics());
  expect(metrics.activeCanvases).toBe(1);
  expect(metrics.activeInputBindings).toBe(1);
  expect(await page.evaluate(() => window.__pirateTest!.snapshot().time)).toBe(
    0,
  );
  await abandon(page);
  expect(errors).toEqual([]);
});

test("real multitouch supports sailing and firing, capture, release, and cancellation", async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(
    !isMobile,
    "Real multitouch is exercised by the mobile Chromium project.",
  );
  await page.goto("/?test=1");
  await start(page);
  const forward = await center(
    page.getByRole("button", { name: "Forward", exact: true }),
  );
  const front = await center(
    page.getByRole("button", { name: "Fire front", exact: true }),
  );
  const cdp = await context.newCDPSession(page);
  const before = await page.evaluate(() => window.__pirateTest!.snapshot());
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { ...forward, id: 1 },
      { ...front, id: 2 },
    ],
  });
  await page.evaluate(() => window.__pirateTest!.advance(0.25));
  const moving = await page.evaluate(() => window.__pirateTest!.snapshot());
  expect(moving.player.y).toBeLessThan(before.player.y);
  expect(moving.projectiles.length).toBeGreaterThan(0);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 15, y: 120, id: 1 },
      { x: 40, y: 120, id: 2 },
    ],
  });
  await page.evaluate(() => window.__pirateTest!.advance(0.25));
  expect(
    await page.evaluate(() => window.__pirateTest!.snapshot().player.y),
  ).toBeLessThan(moving.player.y);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const released = await page.evaluate(
    () => window.__pirateTest!.snapshot().player.y,
  );
  await page.evaluate(() => window.__pirateTest!.advance(0.5));
  expect(
    await page.evaluate(() => window.__pirateTest!.snapshot().player.y),
  ).toBe(released);
  expect(
    await page.evaluate(
      () => window.__pirateTest!.snapshot().player.cooldowns.front,
    ),
  ).toBe(0);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { ...forward, id: 3 },
      { ...front, id: 4 },
    ],
  });
  await page.evaluate(() => window.__pirateTest!.advance(0.1));
  const canceled = await page.evaluate(
    () => window.__pirateTest!.snapshot().player.y,
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await page.evaluate(() => window.__pirateTest!.advance(0.5));
  expect(
    await page.evaluate(() => window.__pirateTest!.snapshot().player.y),
  ).toBe(canceled);
  expect(
    await page.evaluate(
      () => window.__pirateTest!.snapshot().player.cooldowns.front,
    ),
  ).toBe(0);
  await cdp.detach();
});

test("resizing preserves logical coordinates and contains the arena and HUD", async ({
  page,
}) => {
  await page.goto("/?test=1");
  await start(page);
  const before = await page.evaluate(() => window.__pirateTest!.snapshot());
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 915, height: 412 },
    { width: 412, height: 915 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId("arena").locator("canvas")).toBeVisible();
    const bounds = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const frame = document.querySelector(".arena-frame");
      const hud = document.querySelector(".hud");
      if (!canvas || !frame || !hud)
        throw new Error("Combat layout is incomplete.");
      const a = canvas.getBoundingClientRect(),
        b = frame.getBoundingClientRect(),
        h = hud.getBoundingClientRect();
      return {
        canvas: {
          x: a.x,
          y: a.y,
          right: a.right,
          bottom: a.bottom,
          width: a.width,
          height: a.height,
        },
        frame: { x: b.x, y: b.y, right: b.right, bottom: b.bottom },
        hud: { x: h.x, right: h.right, top: h.top, bottom: h.bottom },
        naturalRatio: canvas.width / canvas.height,
        objectFit: getComputedStyle(canvas).objectFit,
        horizontalOverflow:
          document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(bounds.naturalRatio).toBeCloseTo(5 / 3, 2);
    expect(bounds.objectFit).toBe("contain");
    expect(bounds.canvas.width).toBeGreaterThan(0);
    expect(bounds.canvas.height).toBeGreaterThan(0);
    expect(bounds.canvas.x).toBeGreaterThanOrEqual(bounds.frame.x);
    expect(bounds.canvas.y).toBeGreaterThanOrEqual(bounds.frame.y);
    expect(bounds.canvas.right).toBeLessThanOrEqual(bounds.frame.right + 1);
    expect(bounds.canvas.bottom).toBeLessThanOrEqual(bounds.frame.bottom + 1);
    expect(bounds.hud.x).toBeGreaterThanOrEqual(0);
    expect(bounds.hud.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.hud.top).toBeGreaterThanOrEqual(0);
    expect(bounds.hud.bottom).toBeLessThanOrEqual(viewport.height);
    expect(bounds.horizontalOverflow).toBe(false);
    const after = await page.evaluate(() => window.__pirateTest!.snapshot());
    expect(after.player).toEqual(before.player);
    expect(after.time).toBe(before.time);
  }
});

test("dialogs contain keyboard focus and Space activates Pause instead of cannons", async ({
  page,
}) => {
  await page.goto("/?test=1");
  const options = page
    .getByRole("button", { name: "Options", exact: true })
    .first();
  await options.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Captain’s orders" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Game session time")).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByLabel("Game session time")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(options).toBeFocused();
  await start(page);
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  await pause.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("dialog", { name: "Anchors down" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(() => window.__pirateTest!.snapshot().projectiles),
  ).toHaveLength(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Anchors down" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume", exact: true })
    .press("Enter");
  await expect(pause).toBeFocused();
  await page.evaluate(() => window.__pirateTest!.advance(0.5));
  expect(
    await page.evaluate(() => window.__pirateTest!.snapshot().projectiles),
  ).toHaveLength(0);
});

test("visibility events pause active time and foreground does not resume it", async ({
  page,
}) => {
  await page.goto("/?test=1");
  await start(page);
  await page.keyboard.down("w");
  await page.evaluate(() => window.__pirateTest!.advance(0.25));
  const before = await page.evaluate(() => window.__pirateTest!.snapshot());
  // Headless Chromium keeps all tabs visible. Emulate only the browser signal,
  // leaving the production listener and all simulation rules untouched.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(() => page.evaluate(() => window.__pirateTest!.snapshot().status))
    .toBe("paused");
  await page.evaluate(() => window.__pirateTest!.advance(5));
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.keyboard.up("w");
  await expect(
    page.getByRole("dialog", { name: "Anchors down" }),
  ).toBeVisible();
  const paused = await page.evaluate(() => window.__pirateTest!.snapshot());
  expect(paused.time).toBe(before.time);
  expect(paused.player).toEqual(before.player);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.evaluate(() => window.__pirateTest!.advance(0.5));
  expect(
    await page.evaluate(() => window.__pirateTest!.snapshot().player.y),
  ).toBe(before.player.y);
});
