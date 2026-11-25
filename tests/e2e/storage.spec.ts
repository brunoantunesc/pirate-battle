import { test, expect } from '@playwright/test';

test('storage quota failure still shows results and can recover without duplication', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=1');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__pirateTest));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, '__restoreStorage', { configurable: true, value: () => { Storage.prototype.setItem = original; } });
    Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); };
    window.__pirateTest!.advance(120);
  });
  await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('only available in this session');
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.evaluate(() => {
    const restore: unknown = Reflect.get(window, '__restoreStorage');
    if (typeof restore === 'function') restore();
  });
  await page.getByRole('button', { name: 'Retry Registration' }).click();
  await expect(page.getByText('Match registered', { exact: true })).toBeVisible();
  const count = await page.evaluate(async () => {
    const response = await fetch('/api/history?playerId=local-captain');
    const body: { total: number } = await response.json();
    return body.total;
  });
  expect(count).toBe(1);
  expect(errors).toEqual([]);
});
