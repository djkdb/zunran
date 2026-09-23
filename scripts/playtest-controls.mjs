// npm run build && npm run preview -- --port 4196
// GAME_URL=http://127.0.0.1:4196 CHROME_PATH=/path/to/chrome node scripts/playtest-controls.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4196');
    await page.locator('.start-btn').click();
    await page.locator('.intro-skip').click();
    await page.locator('.stage-card').first().click();
    await page.locator('.cond-card').first().click();
    await page.waitForFunction(() => !!window.__game);

    // Supply enough money and a stable board, then pause through the public action.
    const seedBoard = async (full) => page.evaluate((full) => {
      const e = window.__game.engine;
      const s = e.state;
      s.units = [];
      s.slots.forEach((slot) => { slot.unitId = null; slot.locked = false; slot.blocked = false; });
      s.coins = 100000;
      if (!s.paused) e.dispatch({ type: 'TOGGLE_PAUSE' });
      for (let i = 0; i < (full ? s.slots.length : 3); i++) {
        e.dispatch({ type: 'DRAW' });
        const u = s.units[s.units.length - 1];
        u.defId = i < 3 ? 'onigiri' : i === 3 ? 'alba' : 'onigiri';
        u.tier = 1;
      }
      s.slots.forEach((slot) => { slot.unitId = null; slot.locked = false; slot.blocked = false; });
      s.units.forEach((u, i) => { u.slot = i; s.slots[i].unitId = u.id; });
      e.dispatch({ type: 'SELECT', unitId: null });
      return s.units.map((u) => ({ id: u.id, defId: u.defId, tier: u.tier, slot: u.slot }));
    }, full);
    const before = await seedBoard(true);
    await page.waitForTimeout(1200); // Both automation timers must have had time to run.
    assert.deepEqual(await page.evaluate(() => window.__game.engine.state.units.map((u) => ({ id: u.id, defId: u.defId, tier: u.tier, slot: u.slot }))), before, 'paused automation changed the board');

    // A held D buys only once; modified keys and input/button focus stay native.
    await page.evaluate(() => document.activeElement?.blur());
    await seedBoard(false);
    const count = () => page.evaluate(() => window.__game.engine.state.drawCount);
    const countBefore = await count();
    await page.keyboard.down('d');
    await page.keyboard.down('d');
    await page.keyboard.up('d');
    assert.equal(await count(), countBefore + 1, 'held draw key repeated');
    await page.keyboard.press('Control+d');
    assert.equal(await count(), countBefore + 1, 'modified key bought a unit');
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'test-input';
      document.body.append(input);
      input.focus();
    });
    await page.keyboard.press('d');
    await page.keyboard.press('Space');
    assert.equal(await count(), countBefore + 1, 'typing bought a unit');
    assert.equal(await page.evaluate(() => window.__game.engine.state.paused), true, 'typing unpaused');
    await page.evaluate(() => document.querySelector('#test-input').remove());
    await page.locator('.pause-settings button').first().focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.__game.engine.state.paused), true, 'focused button also toggled pause');
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down('Space');
    await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    assert.equal(await page.evaluate(() => window.__game.engine.state.paused), false, 'held Space toggled twice');

    // Keep automation off while checking coordinates and pointer ownership.
    await page.evaluate(() => window.__game.engine.dispatch({ type: 'TOGGLE_PAUSE' }));
    for (const button of await page.locator('.pause-settings button').all()) {
      if (await button.getAttribute('aria-pressed') === 'true') await button.click();
    }
    await seedBoard(false);
    await page.evaluate(() => window.__game.engine.dispatch({ type: 'TOGGLE_PAUSE' }));
    await page.locator('.pause-overlay').waitFor({ state: 'hidden' });
    const points = await page.evaluate(() => {
      const { engine: e } = window.__game;
      const r = document.querySelector('canvas.field-canvas').getBoundingClientRect();
      return [0, 4].map((i) => ({ x: r.left + e.state.slots[i].x * r.width / 640, y: r.top + (e.state.slots[i].y - 16) * r.height / 640 }));
    });
    const [from, to] = points;
    const box = await page.locator('canvas.field-canvas').boundingBox();
    assert.ok(Math.abs(box.width - box.height) < 2, 'game field is stretched');
    const slot = () => page.evaluate(() => window.__game.engine.state.units[0].slot);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.locator('canvas.field-canvas').dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true, clientX: to.x, clientY: to.y });
    await page.mouse.up();
    assert.equal(await slot(), 0, 'cancelled drag moved a unit');
    assert.equal(await page.evaluate(() => window.__game.renderer.interaction.dragUnitId), null);

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.locator('canvas.field-canvas').dispatchEvent('pointerup', { pointerId: 99, isPrimary: false, clientX: from.x, clientY: from.y });
    await page.mouse.up();
    assert.equal(await slot(), 4, 'second pointer interrupted the real drag');

    // Tap-to-move remains usable after a cancelled/completed drag.
    await page.evaluate(() => window.__game.engine.dispatch({ type: 'SELECT', unitId: null }));
    await page.mouse.click(to.x, to.y);
    await page.mouse.click(from.x, from.y);
    assert.equal(await slot(), 0, 'tap-to-move stopped working');
    assert.deepEqual(errors, [], 'browser exceptions');
    console.log(`PASS ${viewport.width}x${viewport.height}: pause, keyboard, cancel, pointer ownership, drag and tap`);
    await context.close();
  }
} finally {
  await browser.close();
}
