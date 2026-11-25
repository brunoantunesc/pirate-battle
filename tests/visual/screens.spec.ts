import { test, expect } from "@playwright/test";

test("menu, deterministic arena and real result", async ({ page }) => {
  await page.goto("/?test=1");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("menu.png", { animations: "disabled" });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__pirateTest));
  await expect(
    page.getByRole("button", { name: "Forward", exact: true }),
  ).toBeEnabled();
  await expect(page).toHaveScreenshot("arena.png", { animations: "disabled" });
  await page.evaluate(() => window.__pirateTest!.advance(120));
  await expect(
    page.getByText("Match registered", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("result.png", { animations: "disabled" });
});
