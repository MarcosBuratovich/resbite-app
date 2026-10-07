import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.RESBITE_QA_URL || 'http://localhost:8081';
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'signup@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: { registration_details_version: 1 } };
  let exchanges = 0, checks = 0;
  await page.route('**/*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path === '/auth/v1/token') {
      exchanges++;
      body = { access_token: 'fixture-token', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user };
    } else if (path === '/auth/v1/user') body = user;
    else if (path === '/rest/v1/rpc/account_access_status') {
      checks++;
      await new Promise(resolve => setTimeout(resolve, 1800));
      body = { account_id: user.id, status: 'access_pending' };
    } else throw Error(`Unexpected backend request: ${path}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${base}/auth?mode=confirm`);
  await page.evaluate(() => sessionStorage.setItem('sb-ewcsgvhuojxdpaspwsrx-auth-token-code-verifier', JSON.stringify('fixture-verifier')));
  await page.goto(`${base}/auth/callback?code=fixture-signup`);
  await expect(page.getByText('You’re on your way', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveURL(/\/account$/);
  assert.equal(exchanges, 1);
  assert.equal(checks, 1);
  await page.getByRole('button', { name: 'Check account access', exact: true }).click();
  await expect(page.getByText('You’re on your way', { exact: true })).toBeVisible();
  assert.equal(checks, 2);
  await page.reload();
  await expect(page.getByText('You’re on your way', { exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('Signup callback passed: delayed access check, pending access, retry and restart; one code exchange; all backend requests intercepted.');
} finally { await browser.close(); }
