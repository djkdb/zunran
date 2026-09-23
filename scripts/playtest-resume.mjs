import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { webkit, devices } from 'playwright';
// Use an actual unavailable origin: WebKit's emulated setOffline can bypass SW.
const root = resolve('dist');
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + '/') && path !== root) { res.writeHead(403).end(); return; }
    const file = path === root ? resolve(root, 'index.html') : path;
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png' };
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await webkit.launch();
try {
  const context = await browser.newContext({ ...devices['iPhone 15'], serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  assert.equal(await page.evaluate(() => localStorage.getItem('zunran:study:v1')), null, 'study must be opt-in');
  await page.getByRole('button', { name: '설정', exact: true }).tap();
  await page.getByRole('button', { name: '동의하고 테스트 기록 시작' }).tap();
  await page.getByRole('button', { name: '닫기', exact: true }).tap();
  await page.locator('.start-btn').tap();
  await page.locator('.intro-skip').tap();
  await page.locator('.stage-card').first().tap();
  await page.locator('.cond-card').first().tap();
  await page.waitForFunction(() => !!window.__game);
  await page.locator('.draw-btn').tap();
  await page.waitForTimeout(11000);
  // Simulate an OS lifecycle notification before reloading the WebView.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.waitForFunction(() => window.__game.engine.state.paused);
  const before = await page.evaluate(() => {
    const e = window.__game.engine;
    return { id: e.runId, wave: e.state.wave, hp: e.state.hp, coins: e.state.coins, units: e.state.units, rng: e.state.rng.getState(), time: e.state.time };
  });
  await page.reload();
  await page.locator('.resume-btn').tap();
  await page.waitForSelector('.pause-overlay');
  const after = await page.evaluate(() => {
    const e = window.__game.engine;
    return { id: e.runId, wave: e.state.wave, hp: e.state.hp, coins: e.state.coins, units: e.state.units, rng: e.state.rng.getState(), time: e.state.time };
  });
  assert.deepEqual(after, before, 'resume changed run state');
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => window.__game.engine.state.time), before.time, 'resume must wait for user');

  // The cached PWA must open and offer the same saved run with network disabled.
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.resume-btn').tap();
  await page.waitForSelector('.pause-overlay');
  assert.equal(await page.evaluate(() => window.__game.engine.runId), before.id);
  await page.locator('.exit-btn').tap();
  await page.locator('.exit-btn').tap();
  await page.waitForSelector('.gameover');
  const plays = await page.evaluate(() => JSON.parse(localStorage.getItem('cvs-night-shift:v1')).totalPlays);
  assert.equal(await page.evaluate(() => localStorage.getItem('zunran:run:v1')), null, 'settled run retained');
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('.resume-btn').count(), 0, 'settled run offered again');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cvs-night-shift:v1')).totalPlays), plays);
  const study = await page.evaluate(() => JSON.parse(localStorage.getItem('zunran:study:v1')));
  assert.equal(study.events.filter((e) => e.type === 'start').length, 1);
  assert.equal(study.events.filter((e) => e.type === 'finish').length, 1);
  assert.ok(study.events.some((e) => e.type === 'play'));
  assert.ok(!JSON.stringify(study).includes('nickname'));
  await page.getByRole('button', { name: '설정', exact: true }).tap();
  await page.getByRole('button', { name: '참여 중 · 끄고 테스트 기록 삭제' }).tap();
  assert.equal(await page.evaluate(() => localStorage.getItem('zunran:study:v1')), null);
  assert.deepEqual(errors, [], 'WebKit exceptions');
  console.log('PASS WebKit / iPhone 15 emulation: opt-in, background, exact resume, offline, settlement, study deletion. NOT a physical-device test.');
  await context.close();
} finally { server.closeAllConnections(); server.close(); await browser.close(); }
