import { expect, test, type Page } from "@playwright/test";

async function contrast(page: Page, state: string) {
  await expect(page.locator("main.app")).toBeVisible();
  // MSW starts before React mounts. Font readiness before that mount can resolve
  // while the text still uses fallback metrics; screenshots wait for the later fonts.
  await page.evaluate(async () => {
    document.body.getBoundingClientRect();
    await document.fonts.ready;
  });
  const text = await page.evaluate(() => {
    const activeDialog = document.querySelector("dialog[open]");
    const walker = document.createTreeWalker(
      activeDialog ?? document.body,
      NodeFilter.SHOW_TEXT,
    );
    const result: {
      text: string;
      color: number[];
      minimum: number;
      rect: { x: number; y: number; width: number; height: number };
    }[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node.parentElement;
      if (
        !element ||
        !node.textContent?.trim() ||
        !element.checkVisibility() ||
        element.closest("script, style, .sr-only, [disabled]")
      )
        continue;
      const style = getComputedStyle(element);
      if (style.visibility !== "visible" || style.display === "none") continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width < 2 || rect.height < 2 || rect.x < 0) continue;
        const color = style.color.match(/[\d.]+/g)?.map(Number) ?? [];
        const large =
          parseFloat(style.fontSize) >= 24 ||
          (parseFloat(style.fontSize) >= 18.66 &&
            Number(style.fontWeight) >= 700);
        result.push({
          text: node.textContent.trim(),
          color,
          minimum: large ? 3 : 4.5,
          rect: {
            x: rect.x,
            y: rect.y + scrollY,
            width: rect.width,
            height: rect.height,
          },
        });
      }
    }
    for (const control of (activeDialog ?? document.body).querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >("input, select")) {
      if (!control.checkVisibility() || control.disabled) continue;
      const rect = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      result.push({
        text: `${control.tagName}: ${control.value}`,
        color: style.color.match(/[\d.]+/g)?.map(Number) ?? [],
        minimum: 4.5,
        rect: {
          x: rect.x + 14,
          y: rect.y + scrollY + 14,
          width: Math.max(1, rect.width - 60),
          height: Math.max(1, rect.height - 28),
        },
      });
    }
    return result;
  });
  // Capture actual composited gradients/art beneath text, rather than assuming a solid background.
  const mask = await page.addStyleTag({
    content:
      "* { color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }",
  });
  const shot = await page.screenshot({
    fullPage: true,
    scale: "css",
    animations: "disabled",
  });
  await mask.evaluate((element) => element.parentNode?.removeChild(element));
  const measurements = await page.evaluate(
    async ({ text, image }) => {
      const bitmap = new Image();
      bitmap.src = image;
      await bitmap.decode();
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const luminance = (rgb: number[]) =>
        rgb
          .slice(0, 3)
          .map((v) => {
            const c = v / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      return text.map((item) => {
        let ratio = Infinity;
        const fg = luminance(item.color);
        for (
          let y = Math.max(0, Math.ceil(item.rect.y));
          y < Math.min(canvas.height, item.rect.y + item.rect.height);
          y += 2
        ) {
          for (
            let x = Math.ceil(item.rect.x);
            x < Math.min(canvas.width, item.rect.x + item.rect.width);
            x += 2
          ) {
            const bg = luminance(Array.from(ctx.getImageData(x, y, 1, 1).data));
            ratio = Math.min(
              ratio,
              (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
            );
          }
        }
        return {
          text: item.text,
          ratio: Number(ratio.toFixed(2)),
          minimum: item.minimum,
        };
      });
    },
    { text, image: `data:image/png;base64,${shot.toString("base64")}` },
  );
  await test.info().attach(`contrast-${state}`, {
    body: JSON.stringify(measurements, null, 2),
    contentType: "application/json",
  });
  expect(
    measurements.filter(
      (item) =>
        !Number.isFinite(item.ratio) || item.ratio + 0.02 < item.minimum,
    ),
    state,
  ).toEqual([]);
}

test("required text contrast across menu, options, records, battle and results", async ({
  page,
}) => {
  await page.goto("/?test=1");
  await contrast(page, "menu");
  await page.locator("summary").click();
  await contrast(page, "network-settings");
  await page.locator("summary").click();
  await page
    .getByRole("button", { name: "Options", exact: true })
    .first()
    .click();
  await contrast(page, "options");
  await page.getByLabel("Game session time").fill("1");
  await page.getByRole("button", { name: "Save Options" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await contrast(page, "validation-error");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Ranking & Match History" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await contrast(page, "ranking");
  await page
    .getByRole("button", { name: "Match History", exact: true })
    .click();
  await expect(
    page.getByText("No completed voyages yet. Set sail to begin your log."),
  ).toBeVisible();
  await contrast(page, "empty-history");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__pirateTest));
  await contrast(page, "battle");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await contrast(page, "pause");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.evaluate(() => window.__pirateTest!.advance(120));
  await expect(page.getByRole("button", { name: "Play Again" })).toBeVisible();
  await expect(
    page.getByText("Match registered", { exact: true }),
  ).toBeVisible();
  await contrast(page, "results");
});

test("keyboard navigation, visible focus, associated errors and semantic battle status", async ({
  page,
}) => {
  await page.goto("/?test=1");
  await expect(
    page.getByRole("link", { name: "Pirate Battle home" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Pirate Battle home" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  const options = page
    .getByRole("button", { name: "Options", exact: true })
    .first();
  await expect(options).toBeFocused();
  expect(
    await options.evaluate((el) => getComputedStyle(el).outlineWidth),
  ).toBe("3px");
  await page.keyboard.press("Enter");
  const duration = page.getByLabel("Game session time");
  await expect(duration).toBeFocused();
  await duration.fill("1");
  await page.getByRole("button", { name: "Save Options" }).press("Enter");
  await expect(duration).toHaveAttribute("aria-invalid", "true");
  await expect(duration).toHaveAccessibleDescription(
    /Session time must be 60–180/,
  );
  await expect(page.getByRole("alert")).toBeVisible();
  await duration.fill("60");
  await page.getByLabel("Enemy spawn time").fill("15");
  await duration.press("ArrowUp");
  await expect(duration).toHaveValue("61");
  await page.getByRole("button", { name: "Save Options" }).press("Enter");
  await expect(options).toBeFocused();
  const summary = page.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Network scenario")).toBeVisible();
  expect(
    await summary.evaluate((el) => getComputedStyle(el).outlineWidth),
  ).toBe("3px");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Play", exact: true }).press("Enter");
  await page.waitForFunction(() => Boolean(window.__pirateTest));
  await expect(
    page.getByRole("meter", { name: "Hull health" }),
  ).toHaveAttribute("value", "100");
  await expect(
    page.getByRole("group", { name: "Score", exact: true }),
  ).toContainText("0");
  await expect(
    page.getByRole("group", { name: "Time left", exact: true }),
  ).toContainText("61s");
  const status = page.getByRole("status", { name: "Match status" });
  await expect(status).toHaveText("Battle running");
  await page.evaluate(() => window.__pirateTest!.advance(1));
  await expect(
    page.getByRole("group", { name: "Time left", exact: true }),
  ).toContainText("60s");
  await expect(status).toHaveText("Battle running");
  expect(
    await page
      .locator(".hud")
      .evaluate((el) =>
        Boolean(
          el.closest(
            '[aria-live="polite"], [aria-live="assertive"], [role="status"]',
          ),
        ),
      ),
  ).toBe(false);
  await page.getByRole("button", { name: "Pause", exact: true }).press("Space");
  const dialog = page.getByRole("dialog", { name: "Anchors down" });
  await expect(dialog.getByRole("button", { name: "Resume" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Abandon Match" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => typeof window.__pirateTest)).toBe(
    "undefined",
  );
});
