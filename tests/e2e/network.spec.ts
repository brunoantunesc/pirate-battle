import { test, expect, type Page } from '@playwright/test';
import type { MatchRecord, PageResult } from '../../src/api/contracts';
import type { Scenario } from '../../src/mocks/scenarios';

async function selectScenario(page: Page, scenario: Scenario) {
  const panel = page.locator('.network-panel');
  if (!(await panel.evaluate(element => element.hasAttribute('open')))) {
    await panel.getByText('Network demo settings', { exact: true }).click();
  }
  await page.getByLabel('Network scenario').selectOption(scenario);
}

async function openRecords(page: Page) {
  await page.getByRole('button', { name: 'Ranking & Match History', exact: true }).click();
  return page.getByRole('dialog', { name: 'Captain’s ledger' });
}

async function completeRealMatch(page: Page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__pirateTest));
  await page.evaluate(() => window.__pirateTest!.advance(120));
  await expect(page.getByRole('button', { name: 'Play Again', exact: true })).toBeVisible();
}

async function historyOverHttp(page: Page): Promise<PageResult<MatchRecord>> {
  return page.evaluate(async () => {
    const response = await fetch('/api/history?playerId=local-captain&page=1');
    if (!response.ok) throw new Error(`History returned HTTP ${response.status}`);
    return response.json();
  });
}

test('ranking and history show loading, empty states, pagination, and isolated query errors', async ({ page }) => {
  await page.goto('/?test=1');
  await selectScenario(page, 'slow');
  let ledger = await openRecords(page);
  await expect(ledger.getByText('Loading records…', { exact: true })).toBeVisible();
  await expect(ledger.getByText('Page 1 of 4', { exact: true })).toBeVisible();
  await ledger.getByRole('button', { name: 'Close', exact: true }).click();

  await selectScenario(page, 'empty');
  ledger = await openRecords(page);
  await expect(ledger.getByText('No captains on this chart yet.')).toBeVisible();
  await ledger.getByRole('button', { name: 'Match History', exact: true }).click();
  await expect(ledger.getByText('No completed voyages yet. Set sail to begin your log.')).toBeVisible();
  await ledger.getByRole('button', { name: 'Close', exact: true }).click();

  await selectScenario(page, 'pages');
  ledger = await openRecords(page);
  await ledger.getByRole('button', { name: 'Match History', exact: true }).click();
  await expect(ledger.getByText('Page 1 of 4', { exact: true })).toBeVisible();
  const firstPage = await ledger.locator('tbody').innerText();
  await ledger.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(ledger.getByText('Page 2 of 4', { exact: true })).toBeVisible();
  expect(await ledger.locator('tbody').innerText()).not.toBe(firstPage);
  await expect(ledger.locator('tbody tr')).toHaveCount(5);
  await ledger.getByRole('button', { name: 'Close', exact: true }).click();

  await selectScenario(page, 'ranking-failure');
  ledger = await openRecords(page);
  await expect(ledger.getByRole('alert')).toContainText('HTTP 503');
  await expect(ledger.getByRole('button', { name: 'Retry records' })).toBeVisible();
  await ledger.getByRole('button', { name: 'Match History', exact: true }).click();
  await expect(ledger.getByText('No completed voyages yet. Set sail to begin your log.')).toBeVisible();
  await ledger.getByRole('button', { name: 'Close', exact: true }).click();

  await selectScenario(page, 'history-failure');
  ledger = await openRecords(page);
  await expect(ledger.getByRole('table')).toBeVisible();
  await ledger.getByRole('button', { name: 'Match History', exact: true }).click();
  await expect(ledger.getByRole('alert')).toContainText('HTTP 503');
});

test('completion during unavailability survives refresh, permits another match, and retries into both tabs', async ({ page }) => {
  await page.goto('/?test=1');
  await selectScenario(page, 'unavailable');
  const failedRegistration = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/history') && response.status() === 503);
  await completeRealMatch(page);
  await failedRegistration;
  await expect(page.getByText(/Registration pending/)).toBeVisible();

  await page.getByRole('button', { name: 'Play Again', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__pirateTest));
  expect(await page.evaluate(() => window.__pirateTest!.snapshot().time)).toBe(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Abandon Match', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /View Last Result/ }).click();
  await expect(page.getByText(/Registration pending/)).toBeVisible();
  await page.getByRole('button', { name: 'Main Menu', exact: true }).click();
  await selectScenario(page, 'success');

  const ledger = await openRecords(page);
  await expect(ledger.getByText('1 match awaiting registration. You can keep playing.')).toBeVisible();
  await ledger.getByRole('button', { name: 'Retry pending matches', exact: true }).click();
  await expect(ledger.getByRole('button', { name: 'Retry pending matches', exact: true })).toHaveCount(0);
  await ledger.getByRole('button', { name: 'Match History', exact: true }).click();
  await expect(ledger.locator('tbody tr')).toHaveCount(1);
  await expect(ledger.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  await ledger.getByRole('button', { name: 'Ranking', exact: true }).click();
  for (let currentPage = 1; currentPage < 4; currentPage++) {
    await expect(ledger.getByText(`Page ${currentPage} of 4`, { exact: true })).toBeVisible();
    await ledger.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(ledger.getByRole('rowheader', { name: 'Captain', exact: true })).toBeVisible();
  expect((await historyOverHttp(page)).total).toBe(1);
});

test('timeout after persistence recovers by HTTP acknowledgement without duplicate ranking or history records', async ({ page }) => {
  await page.goto('/?test=1');
  await selectScenario(page, 'timeout-after-save');
  const failedPosts: string[] = [];
  page.on('requestfailed', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/history')) failedPosts.push(request.url());
  });
  await completeRealMatch(page);
  await expect.poll(() => failedPosts.length).toBe(1);
  await expect(page.getByText(/Registration pending/)).toBeVisible();
  const persisted = await historyOverHttp(page);
  expect(persisted.total).toBe(1);
  const record = persisted.items[0];
  await page.getByRole('button', { name: 'Retry Registration', exact: true }).click();
  await expect(page.getByText('Match registered', { exact: true })).toBeVisible();

  const counts = await page.evaluate(async match => {
    const repeated = await Promise.all([1, 2].map(() => fetch('/api/history', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': match.id }, body: JSON.stringify(match),
    })));
    if (repeated.some(response => !response.ok)) throw new Error('Idempotent registration failed');
    const historyResponse = await fetch('/api/history?playerId=local-captain');
    const history: PageResult<MatchRecord> = await historyResponse.json();
    const rankingResponse = await fetch(`/api/ranking?config=${encodeURIComponent(JSON.stringify(match.config))}&page=4`);
    const ranking: PageResult<MatchRecord> = await rankingResponse.json();
    return { historyTotal: history.total, historyCopies: history.items.filter(item => item.id === match.id).length, rankingTotal: ranking.total, rankingCopies: ranking.items.filter(item => item.id === match.id).length };
  }, record);
  expect(counts).toEqual({ historyTotal: 1, historyCopies: 1, rankingTotal: 19, rankingCopies: 1 });
  await page.reload();
  await page.getByRole('button', { name: /View Last Result/ }).click();
  await expect(page.getByText('Match registered', { exact: true })).toBeVisible();
});

test('a late ranking response cannot replace the selected history tab', async ({ page }) => {
  await page.goto('/?test=1');
  await selectScenario(page, 'out-of-order');
  const rankingStarted = page.waitForRequest(request => request.method() === 'GET' && request.url().includes('/api/ranking?'));
  const ledger = await openRecords(page);
  await rankingStarted;
  // The first request has 1800ms latency, the history request only 50ms.
  // This signal observes the superseded HTTP request ending, without a sleep.
  const rankingEnded = Promise.race([
    page.waitForResponse(response => response.url().includes('/api/ranking?')),
    page.waitForEvent('requestfailed', request => request.url().includes('/api/ranking?')),
  ]);
  await ledger.getByRole('button', { name: 'Match History', exact: true }).click();
  await expect(ledger.getByText('No completed voyages yet. Set sail to begin your log.')).toBeVisible();
  await rankingEnded;
  await expect(ledger.getByRole('button', { name: 'Match History', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(ledger.getByRole('heading', { name: 'Captain’s log' })).toBeVisible();
  await expect(ledger.getByRole('heading', { name: 'Legends of the sea' })).toHaveCount(0);
  await expect(ledger.getByRole('table')).toHaveCount(0);
});
