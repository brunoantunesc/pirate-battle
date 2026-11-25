import { test, expect, type Page } from "@playwright/test";

async function start(page: Page) {
  await page.goto("/?test=1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__pirateTest));
}

test("asset failure offers retry before simulation starts", async ({
  page,
  context,
}) => {
  await context.route("**/assets/png/default/ships/ship_2.png", (route) =>
    route.abort(),
  );
  await page.goto("/?test=1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry assets" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Forward", exact: true }),
  ).toBeDisabled();
  await context.unroute("**/assets/png/default/ships/ship_2.png");
  await page.getByRole("button", { name: "Retry assets" }).click();
  await page.waitForFunction(() => Boolean(window.__pirateTest));
  expect(await page.evaluate(() => window.__pirateTest!.snapshot().time)).toBe(
    0,
  );
});

test("completed match registers once and survives refresh", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => window.__pirateTest!.advance(120));
  await expect(page.getByRole("button", { name: "Play Again" })).toBeVisible();
  await expect(
    page.getByText("Match registered", { exact: true }),
  ).toBeVisible();
  const score = await page.locator(".score-total").textContent();
  await page.reload();
  await page.getByRole("button", { name: /View Last Result/ }).click();
  await expect(page.locator(".score-total")).toHaveText(score ?? "");
  await expect(
    page.getByText("Match registered", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play Again" }).click();
  await page.waitForFunction(() => Boolean(window.__pirateTest));
  const state = await page.evaluate(() => window.__pirateTest!.snapshot());
  expect(state.time).toBe(0);
  expect(state.score).toBe(0);
  expect(state.enemies).toHaveLength(0);
  expect(state.player.hp).toBe(state.player.maxHp);
});

test("ranking pagination and empty history are accessible", async ({
  page,
}) => {
  await page.goto("/?test=1");
  await page.getByRole("button", { name: "Ranking & Match History" }).click();
  await expect(page.getByText("Page 1 of 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 4", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Match History", exact: true })
    .click();
  await expect(
    page.getByText("No completed voyages yet. Set sail to begin your log."),
  ).toBeVisible();
});

test("pointer controls and automatic pause clear held input", async ({
  page,
}) => {
  await start(page);
  const button = page.getByRole("button", { name: "Forward", exact: true });
  const bounds = await button.boundingBox();
  if (!bounds) throw new Error("Forward control is missing");
  const before = await page.evaluate(
    () => window.__pirateTest!.snapshot().player.y,
  );
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.evaluate(() => window.__pirateTest!.advance(0.25));
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.__pirateTest!.snapshot().player.y),
  ).toBeLessThan(before);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(
    page.getByRole("dialog", { name: "Anchors down" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  const pausedY = await page.evaluate(
    () => window.__pirateTest!.snapshot().player.y,
  );
  await page.evaluate(() => window.__pirateTest!.advance(0.25));
  expect(
    await page.evaluate(() => window.__pirateTest!.snapshot().player.y),
  ).toBe(pausedY);
});
