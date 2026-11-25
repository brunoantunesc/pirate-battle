import { test, expect } from "@playwright/test";

test("options validate and survive refresh", async ({ page }) => {
  await page.goto("/?test=1");
  await page
    .getByRole("button", { name: "Options", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Game session time").fill("59");
  await dialog.getByRole("button", { name: "Save Options" }).click();
  await expect(dialog.getByRole("alert")).toContainText("60–180");
  await dialog.getByLabel("Game session time").fill("90");
  await dialog.getByLabel("Enemy spawn time").fill("4");
  await dialog.getByRole("button", { name: "Save Options" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Options", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Game session time")).toHaveValue("90");
  await expect(page.getByLabel("Enemy spawn time")).toHaveValue("4");
});

test("real input moves the ship and pause freezes the simulation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?test=1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("arena").locator("canvas")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__pirateTest));
  const before = await page.evaluate(() => window.__pirateTest!.snapshot());
  await page.keyboard.down("w");
  await page.keyboard.down("Space");
  await page.evaluate(() => window.__pirateTest!.advance(0.5));
  await page.keyboard.up("w");
  await page.keyboard.up("Space");
  const after = await page.evaluate(() => window.__pirateTest!.snapshot());
  expect(after.player.y).toBeLessThan(before.player.y);
  expect(after.projectiles.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Anchors down" }),
  ).toBeVisible();
  await page.evaluate(() => window.__pirateTest!.advance(5));
  expect(await page.evaluate(() => window.__pirateTest!.snapshot().time)).toBe(
    after.time,
  );
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.evaluate(() => window.__pirateTest!.advance(0.5));
  expect(
    await page.evaluate(() => window.__pirateTest!.snapshot().time),
  ).toBeGreaterThan(after.time);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Abandon Match" }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});
