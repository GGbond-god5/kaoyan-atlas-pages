// Run against local Pages with SMS_DEV_CODE=1. Pass an installed Playwright module path.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const base = process.argv[3] || 'http://127.0.0.1:8788';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'use a local Pages server');
const screenshots = process.argv[4];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }

try {
  const health = await (await page.request.get(base + '/api/health')).json();
  assert.ok(health.smsMode === 'mock' && health.smsDevCode, 'enable local SMS mock before running tests');
  check((await page.request.get(base + '/assets/data.js')).status() === 401, 'anonymous protected assets return 401');
  await page.goto(base + '/login?next=%2Fpractice');
  await page.locator('#phone').waitFor();
  const card = await page.locator('.acard').boundingBox();
  check(Math.abs(card.x + card.width / 2 - 720) < 2, 'login card is horizontally centered');
  await page.getByRole('tab', { name: '密码登录' }).focus();
  await page.keyboard.press('ArrowRight');
  check(await page.getByRole('tab', { name: '验证码登录' }).getAttribute('aria-selected') === 'true', 'arrow switches login method');
  check(await page.locator('#code').isVisible(), 'SMS field is visible after switching');
  await page.keyboard.press('ArrowLeft');
  check(await page.locator('#password').isVisible(), 'arrow switches back to password');
  await page.locator('#submitBtn').click();
  check(await page.locator('#alert').isVisible(), 'invalid phone has visible feedback');
  check(await page.locator('#phone').evaluate(el => el === document.activeElement), 'invalid phone receives focus');

  if (screenshots) {
    await mkdir(screenshots, { recursive: true });
    await page.reload();
    await page.screenshot({ path: screenshots + '/login-desktop.png', fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/login', '/register']) {
    await page.goto(base + route);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route + ' fits mobile');
    if (screenshots) await page.screenshot({ path: screenshots + route + '-mobile.png', fullPage: true, animations: 'disabled' });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  check(await page.locator('.acard').evaluate(el => getComputedStyle(el).animationName === 'none'), 'reduced motion disables card entrance');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (screenshots) await page.screenshot({ path: screenshots + '/register-desktop.png', fullPage: true, animations: 'disabled' });

  // Disposable account exists only in local D1. No external SMS provider is called.
  const phone = '139' + String(Date.now()).slice(-8);
  await page.locator('#phone').fill(phone);
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('#code').value.length === 6);
  check(await page.locator('#sendBtn').isDisabled(), 'SMS resend cooldown is active');
  await page.locator('#nickname').fill('本地审阅');
  await page.locator('#password').fill('Review2026');
  await page.locator('#password2').fill('Review2026');
  await page.locator('#agree').check();
  await page.locator('#submitBtn').click();
  await page.waitForURL(url => url.pathname === '/');
  check((await page.request.get(base + '/api/auth/me')).ok(), 'registration creates a session');
  await page.goto(base + '/login');
  await page.locator('#viewAccount').waitFor({ state: 'visible' });
  check(await page.locator('#nickname').textContent() === '本地审阅', 'account panel displays registered user');
  await page.locator('#logoutBtn').click();
  await page.locator('#viewForm').waitFor({ state: 'visible' });
  await page.locator('#phone').fill(phone);
  await page.locator('#password').fill('Incorrect2026');
  await page.locator('#submitBtn').click();
  await page.waitForFunction(() => document.querySelector('#alert').textContent.includes('不正确'));
  check(await page.locator('#submitBtn').isEnabled(), 'failed password login can be retried');
  await page.locator('#password').fill('Review2026');
  await page.locator('#submitBtn').click();
  await page.waitForURL(url => url.pathname === '/');
  check((await page.request.get(base + '/assets/data.js')).ok(), 'login grants access to protected assets');
  await page.request.post(base + '/api/auth/logout', { data: {} });
  await page.goto(base + '/login?next=%2Fpractice');
  await page.getByRole('tab', { name: '验证码登录' }).click();
  await page.locator('#phone').fill(phone);
  // A previous registration code enforces the shared 60-second cooldown.
  await page.waitForTimeout(61000);
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('#code').value.length === 6);
  await page.locator('#submitBtn').click();
  await page.waitForURL('**/practice');
  check(new URL(page.url()).pathname === '/practice', 'SMS login preserves next destination');
  check(errors.length === 0, 'no browser runtime errors ' + errors.join(', '));
  console.log(`PASS ${checks} auth UI and local D1 checks`);
} finally {
  await browser.close();
}
