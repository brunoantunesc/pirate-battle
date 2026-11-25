import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_CONFIG } from "../../src/game/config";

const tick = DEFAULT_CONFIG.physics.timestep;

async function start(
  page: Page,
  options?: { duration: number; spawn: number },
) {
  await page.goto("/?test=1");
  if (options) {
    await page
      .getByRole("button", { name: "Options", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Game session time").fill(String(options.duration));
    await dialog.getByLabel("Enemy spawn time").fill(String(options.spawn));
    await dialog.getByRole("button", { name: "Save Options" }).click();
    await expect(dialog).not.toBeVisible();
  }
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__pirateTest));
  await expect(
    page.getByRole("button", { name: "Forward", exact: true }),
  ).toBeEnabled();
  await page.getByTestId("arena").click();
}

async function advance(page: Page, seconds: number) {
  return page.evaluate((duration) => {
    const api = window.__pirateTest;
    if (!api) throw new Error("Expected an active deterministic battle");
    api.advance(duration);
    return api.snapshot();
  }, seconds);
}

async function hold(page: Page, keys: string[], seconds: number) {
  for (const key of keys) await page.keyboard.down(key);
  const state = await advance(page, seconds);
  for (const key of keys) await page.keyboard.up(key);
  return state;
}

test("real controls rotate both ways and keep the ship inside the arena", async ({
  page,
}) => {
  await start(page, { duration: 60, spawn: 15 });
  const initial = await advance(page, 0);
  const left = await hold(page, ["a"], 0.2);
  expect(left.player.angle).toBeLessThan(initial.player.angle);
  const right = await hold(page, ["d"], 0.2);
  expect(right.player.angle).toBeCloseTo(initial.player.angle, 8);
  const north = await hold(page, ["w"], 3);
  expect(north.player.y).toBeCloseTo(north.player.radius, 5);
  expect(north.player.x).toBeCloseTo(initial.player.x, 5);
  await hold(page, ["d"], 36 * tick);
  const east = await hold(page, ["w"], 4);
  expect(east.player.x).toBeCloseTo(
    DEFAULT_CONFIG.arena.width - east.player.radius,
    5,
  );
  expect(east.player.y).toBeGreaterThanOrEqual(east.player.radius);
  expect(east.player.y).toBeLessThanOrEqual(
    DEFAULT_CONFIG.arena.height - east.player.radius,
  );
});

test("real sailing stops at the island and the island consumes a bow shot", async ({
  page,
}) => {
  await start(page, { duration: 60, spawn: 15 });
  // Twenty-six left-turn ticks aim from the actual start position at the northwest island.
  await hold(page, ["a"], 26 * tick);
  const contact = await hold(page, ["w"], 2);
  const island = DEFAULT_CONFIG.islands[0];
  const distance = Math.hypot(
    contact.player.x - island.x,
    contact.player.y - island.y,
  );
  expect(distance).toBeGreaterThanOrEqual(
    island.radius + contact.player.radius,
  );
  expect(distance).toBeLessThan(island.radius + contact.player.radius + 0.1);
  const stillBlocked = await hold(page, ["w"], 0.5);
  expect(stillBlocked.player.x).toBeCloseTo(contact.player.x, 3);
  expect(stillBlocked.player.y).toBeCloseTo(contact.player.y, 3);
  const fired = await hold(page, ["Space"], tick);
  expect(fired.projectiles).toHaveLength(0);
  expect(fired.effects.some((effect) => effect.kind === "shot")).toBe(true);
  expect(fired.effects.some((effect) => effect.kind === "hit")).toBe(true);
  expect(fired.score).toBe(0);
});

test("bow and independent broadsides fire one plus three plus three with cooldowns", async ({
  page,
}) => {
  await start(page, { duration: 60, spawn: 15 });
  const first = await hold(page, ["Space", "q", "e"], tick);
  expect(first.projectiles).toHaveLength(7);
  const front = first.projectiles.filter((shot) => shot.vy < -400);
  const port = first.projectiles.filter((shot) => shot.vx < -400);
  const starboard = first.projectiles.filter((shot) => shot.vx > 400);
  expect(front).toHaveLength(1);
  expect(port).toHaveLength(3);
  expect(starboard).toHaveLength(3);
  expect(new Set(port.map((shot) => shot.y)).size).toBe(3);
  expect(new Set(starboard.map((shot) => shot.y)).size).toBe(3);
  expect(new Set(port.map((shot) => shot.vx)).size).toBe(1);
  expect(new Set(starboard.map((shot) => shot.vx)).size).toBe(1);
  const ids = first.projectiles.map((shot) => shot.id);
  const blocked = await hold(page, ["Space", "q", "e"], tick);
  expect(blocked.projectiles.map((shot) => shot.id)).toEqual(ids);
  await advance(page, 22 * tick);
  const reloadedBow = await hold(page, ["Space", "q", "e"], tick);
  const added = reloadedBow.projectiles.filter(
    (shot) => !ids.includes(shot.id),
  );
  expect(added).toHaveLength(1);
  expect(added[0].vy).toBeLessThan(-400);
  expect(reloadedBow.player.cooldowns.port).toBeGreaterThan(0);
  expect(reloadedBow.player.cooldowns.starboard).toBeGreaterThan(0);
  await advance(page, 0.8);
  const beforeSides = await advance(page, 0);
  const sideReload = await hold(page, ["q", "e"], tick);
  const priorIds = new Set(beforeSides.projectiles.map((shot) => shot.id));
  expect(
    sideReload.projectiles.filter((shot) => !priorIds.has(shot.id)),
  ).toHaveLength(6);
});

test("actual bow hits damage and destroy a spawned enemy for exactly one point", async ({
  page,
}) => {
  await start(page);
  const spawned = await advance(page, 3);
  expect(spawned.enemies).toHaveLength(1);
  const targetId = spawned.enemies[0].id;
  expect(spawned.enemies[0].kind).toBe("chaser");
  // The seeded Chaser starts slightly west of the bow. Aim with actual rotation input.
  await hold(page, ["a"], 4 * tick);
  await page.keyboard.down("Space");
  let observedDamage = false;
  let state = await advance(page, 0);
  for (let sample = 0; sample < 12 && state.score === 0; sample++) {
    state = await advance(page, 0.1);
    const target = state.enemies.find((enemy) => enemy.id === targetId);
    if (target && target.hp < target.maxHp) observedDamage = true;
  }
  await page.keyboard.up("Space");
  expect(observedDamage).toBe(true);
  expect(state.score).toBe(1);
  expect(state.enemies.some((enemy) => enemy.id === targetId)).toBe(false);
  expect(state.player.hp).toBe(state.player.maxHp);
  const afterRemoval = await advance(page, 1);
  expect(afterRemoval.score).toBe(1);
  expect(afterRemoval.enemies.some((enemy) => enemy.id === targetId)).toBe(
    false,
  );
});

test("spawn timing, Chaser impact and Shooter movement and fire follow actual rules", async ({
  page,
}) => {
  await start(page);
  expect((await advance(page, 179 * tick)).enemies).toHaveLength(0);
  const firstSpawn = await advance(page, tick);
  expect(firstSpawn.enemies).toHaveLength(1);
  const chaser = firstSpawn.enemies[0];
  const distance = Math.hypot(
    chaser.x - firstSpawn.player.x,
    chaser.y - firstSpawn.player.y,
  );
  expect(distance).toBeGreaterThanOrEqual(DEFAULT_CONFIG.spawn.minDistance);
  const pursuit = await advance(page, 0.5);
  expect(
    Math.hypot(
      pursuit.enemies[0].x - pursuit.player.x,
      pursuit.enemies[0].y - pursuit.player.y,
    ),
  ).toBeLessThan(distance);
  const secondSpawn = await advance(page, 2.5);
  expect(secondSpawn.player.hp).toBe(
    DEFAULT_CONFIG.player.hp - DEFAULT_CONFIG.chaser.damage,
  );
  expect(secondSpawn.score).toBe(0);
  expect(secondSpawn.enemies.some((enemy) => enemy.id === chaser.id)).toBe(
    false,
  );
  const shooter = secondSpawn.enemies.find((enemy) => enemy.kind === "shooter");
  expect(shooter).toBeDefined();
  if (!shooter) throw new Error("Shooter did not spawn at the second interval");
  const shooting = await advance(page, 0.2);
  expect(shooting.projectiles.some((shot) => shot.owner === "enemy")).toBe(
    true,
  );
  const moving = await hold(page, ["w"], 0.5);
  const pursued = moving.enemies.find((enemy) => enemy.id === shooter.id);
  expect(pursued).toBeDefined();
  if (!pursued) throw new Error("Shooter disappeared without being attacked");
  expect(pursued.x).not.toBe(shooter.x);
  expect(pursued.angle).not.toBe(shooter.angle);
  for (const enemy of moving.enemies) {
    for (const island of DEFAULT_CONFIG.islands) {
      expect(
        Math.hypot(enemy.x - island.x, enemy.y - island.y),
      ).toBeGreaterThanOrEqual(enemy.radius + island.radius);
    }
  }
});

test("actual damage ends by death and the ended simulation cannot advance", async ({
  page,
}) => {
  await start(page);
  const result = await page.evaluate(() => {
    const api = window.__pirateTest;
    if (!api) throw new Error("Battle instrumentation missing");
    api.advance(120);
    const ended = api.snapshot();
    api.advance(10);
    return { ended, after: api.snapshot() };
  });
  expect(result.ended.status).toBe("ended");
  expect(result.ended.reason).toBe("death");
  expect(result.ended.player.hp).toBe(0);
  expect(result.ended.time).toBeLessThan(120);
  expect(result.ended.score).toBe(0);
  expect(result.after).toEqual(result.ended);
  await expect(page.getByText(/Ship sunk ·/)).toBeVisible();
});

test("real evasive sailing and cannon controls survive until the configured time limit", async ({
  page,
}) => {
  await start(page, { duration: 60, spawn: 15 });
  for (const key of ["w", "d", "Space", "q", "e"])
    await page.keyboard.down(key);
  const result = await page.evaluate(() => {
    const api = window.__pirateTest;
    if (!api) throw new Error("Battle instrumentation missing");
    api.advance(60);
    const ended = api.snapshot();
    api.advance(10);
    return { ended, after: api.snapshot() };
  });
  for (const key of ["w", "d", "Space", "q", "e"]) await page.keyboard.up(key);
  expect(result.ended.status).toBe("ended");
  expect(result.ended.reason).toBe("time");
  expect(result.ended.time).toBe(60);
  expect(result.ended.player.hp).toBeGreaterThan(0);
  expect(result.ended.score).toBeGreaterThan(0);
  expect(result.after).toEqual(result.ended);
  await expect(
    page.getByText("Time completed · 60.0 seconds at sea"),
  ).toBeVisible();
});
