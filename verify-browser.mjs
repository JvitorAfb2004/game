// Drives the game in headless Chromium: console errors, FPS while walking,
// notebook aim + click/E, XP overlay open/close.
// Usage: node verify-browser.mjs [url]
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:5173';
const SHOT = 'C:/Users/JVITOR/AppData/Local/Temp/opencode';
const out = { url: URL };

function fail(step, extra) {
  console.error(JSON.stringify({ ok: false, step, ...extra }));
  process.exit(1);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const perfLogs = [];
  const errors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[perf')) perfLogs.push(t);
  });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));

  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  const webgl2 = await page.evaluate(
    () => !!document.createElement('canvas').getContext('webgl2'),
  );
  if (!webgl2) fail('webgl2-unavailable', {});
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.scene');
      return el && !!el.__game;
    },
    null,
    { timeout: 30000 },
  );
  out.engineReady = true;

  // Auth: register a fresh bot account, then continue.
  const uname = `bot${Date.now()}`;
  await page.locator('.login-panel input[autocomplete="username"]').fill(uname);
  await page.locator('.login-panel input[type="password"]').fill('segredo1');
  await page.locator('.login-panel .link-button').click();
  await page.locator('.login-panel .deploy-button').click();
  await page.waitForSelector('.mission-menu', { timeout: 15000 });
  out.loggedIn = uname;

  await page
    .getByRole('button', { name: /ENTRAR NO ESCRITÓRIO/i })
    .click({ timeout: 10000 });
  await page.waitForFunction(
    () => document.querySelector('.scene')?.dataset.mode === 'playing',
    null,
    { timeout: 10000 },
  );
  out.modeAfterStart = 'playing';

  const hudPlayers = await page
    .locator('[data-testid="hud-players"]')
    .isVisible()
    .catch(() => false);
  const hudFps = await page
    .locator('[data-testid="hud-fps"]')
    .textContent()
    .catch(() => null);
  out.hud = { hudPlayers, hudFps };
  if (!hudPlayers || !/FPS/.test(hudFps ?? '')) fail('hud-missing', out.hud);

  // FPS while walking forward for 5s.
  await page.keyboard.down('w');
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - t0 < 5000) requestAnimationFrame(tick);
          else resolve(n / 5);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.keyboard.up('w');
  out.headlessFpsWalking = Math.round(fps * 10) / 10;
  out.perfLogs = perfLogs.slice(-6);
  await page.screenshot({ path: `${SHOT}/shot-playing.png` });

  // Aim at notebook 0 from inside its room.
  const aim = await page.evaluate(() => {
    const g = document.querySelector('.scene').__game;
    const n = g.env.notebooks[0];
    const side = Math.sign(n.x);
    g.camera.position.set(n.x - side * 1.5, 1.7, n.z);
    const dx = side * 1.5;
    const dy = n.y - 1.7;
    const d = Math.hypot(dx, dy);
    g.yaw = Math.atan2(-dx, 0.0001);
    g.pitch = Math.asin(dy / d);
    return { nx: n.x, side, yaw: g.yaw, pitch: g.pitch };
  });
  out.aim = aim;
  await page
    .waitForFunction(
      () => !!document.querySelector('.scene').__game.notebookTarget,
      null,
      { timeout: 5000 },
    )
    .catch(() => {});
  const targeted = await page.evaluate(() => {
    const g = document.querySelector('.scene').__game;
    return {
      aimed: !!g.notebookTarget,
      prompt: g.state.prompt,
      mode: g.state.mode,
      pos: [g.camera.position.x, g.camera.position.z],
      keys: [...g.keys],
    };
  });
  out.notebookTargeted = targeted;
  if (!targeted.aimed) fail('notebook-not-targeted', targeted);
  const toastVisible = await page
    .locator('.interact-toast')
    .isVisible()
    .catch(() => false);
  out.toastVisible = toastVisible;
  if (!toastVisible) fail('prompt-toast-not-visible', targeted);
  await page.screenshot({ path: `${SHOT}/shot-aim.png` });

  // Click path.
  await page.mouse.click(640, 400);
  await page.waitForTimeout(500);
  const afterClick = await page.evaluate(() => ({
    mode: document.querySelector('.scene').dataset.mode,
  }));
  const xpVisible = await page
    .locator('.xp')
    .isVisible()
    .catch(() => false);
  out.afterClick = { ...afterClick, xpVisible };
  await page.screenshot({ path: `${SHOT}/shot-xp.png` });
  if (afterClick.mode !== 'desktop' || !xpVisible)
    fail('xp-not-opened-on-click', out.afterClick);

  // ESC path.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const afterEsc = await page.evaluate(() => ({
    mode: document.querySelector('.scene').dataset.mode,
  }));
  const xpGone = !(await page
    .locator('.xp')
    .isVisible()
    .catch(() => false));
  out.afterEsc = { ...afterEsc, xpGone };
  if (afterEsc.mode !== 'playing' || !xpGone) fail('esc-failed', out.afterEsc);

  // E key path (already back in play after ESC).
  await page.evaluate(() => {
    const g = document.querySelector('.scene').__game;
    const n = g.env.notebooks[0];
    const side = Math.sign(n.x);
    g.camera.position.set(n.x - side * 1.5, 1.7, n.z);
    g.camera.lookAt(n.x, n.y, n.z);
    g.pitch = g.camera.rotation.x;
    g.yaw = g.camera.rotation.y;
  });
  await page.waitForTimeout(500);
  out.beforeE = await page.evaluate(() => {
    const g = document.querySelector('.scene').__game;
    return {
      mode: g.state.mode,
      aimed: !!g.notebookTarget,
      prompt: g.state.prompt,
    };
  });
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  const afterE = await page.evaluate(() => ({
    mode: document.querySelector('.scene').dataset.mode,
  }));
  const xpVisible2 = await page
    .locator('.xp')
    .isVisible()
    .catch(() => false);
  out.afterE = { ...afterE, xpVisible: xpVisible2 };
  if (afterE.mode !== 'desktop' || !xpVisible2) fail('xp-not-opened-on-E', out);

  if (errors.length) fail('page-errors', { errors: errors.slice(0, 5) });
  out.pageErrors = 0;
  out.ok = true;
  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
