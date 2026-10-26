import assert from 'node:assert/strict';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';

const browser = await launchTestBrowser();
const errors = [];
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(previewUrl);
    await page.locator('[data-active-workspace]').waitFor();
    for (const id of ['settings', 'map_art', 'ai_builder']) {
      const navigation = page.locator(`[data-workspace-id="${id}"]`).filter({ visible: true }).first();
      if (!(await navigation.count())) await page.locator('[data-mobile-menu-toggle="true"]').click();
      await page.locator(`[data-workspace-id="${id}"]`).filter({ visible: true }).first().click();
      await page.locator(`[data-active-workspace="${id}"]`).waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `${id} overflows ${viewport.width}px by ${overflow}px`);
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('Responsive navigation passed: desktop, compact desktop, mobile.');
} finally {
  await browser.close();
}
