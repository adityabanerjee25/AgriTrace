// Browser regression with isolated API fixtures; never contacts CEDA or inference.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  await page.addInitScript(() => {
    const user = { id: 'routing-test', name: 'Routing test', role: 'FARMER' };
    localStorage.setItem('khetsetu_user', JSON.stringify(user));
    localStorage.setItem('agritrace_access_token', 'test.' + btoa(JSON.stringify({ sub: user.id, role: user.role, exp: Date.now() / 1000 + 3600 })) + '.test');
  });
  let uploadedCrop;
  await page.route('**/api/**', route => {
    if (route.request().url().includes('/api/produce-quality')) {
      uploadedCrop = route.request().postDataJSON().cropId;
      return route.fulfill({ json: { success: true, data: { assessmentId: 'fixture', result: { grade: 'A', reason: 'Fixture assessment', samples: [] } } } });
    }
    return route.fulfill({ json: { success: true, data: { items: [] }, notifications: [] } });
  });
  await page.goto((process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:5175') + '/farmer/market/overview');
  await page.getByRole('button', { name: /Tomato.*kg/ }).click();
  await page.getByRole('link', { name: 'Sell lots & FPO', exact: true }).click();
  await page.getByRole('button', { name: 'Create sell lot', exact: true }).last().click();
  assert.equal(await page.locator('#lot-crop').inputValue(), 'TOMATO');
  await page.getByText('Tomato detection and ripeness models are enabled.', { exact: false }).waitFor();
  await page.locator('#produce-upload').setInputFiles({ name: 'tomato.png', mimeType: 'image/png', buffer: await page.screenshot() });
  await page.getByText('Provisional visual grade: A', { exact: true }).waitFor();
  assert.equal(uploadedCrop, 'TOMATO');
  await page.locator('#lot-crop').selectOption('WHEAT');
  assert.equal(await page.locator('.produce-photo-list article').count(), 0);
  console.log('PASS: selected Tomato reaches the upload API; changing crop clears prior assessments.');
} finally {
  await browser.close();
}

