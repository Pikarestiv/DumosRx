import { test as base, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export const test = base.extend({
  page: async ({ page }, use) => {
    // Go to a known page to ensure we can execute script in context
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const fixturePath = path.join(__dirname, '.auth', 'test-db.bin');
    if (fs.existsSync(fixturePath)) {
      const dbBinary = fs.readFileSync(fixturePath);
      // Pass it as an array of numbers so it can be serialized into the browser context
      const binaryArray = Array.from(dbBinary);
      
      await page.evaluate(async (data) => {
        // Wait for window.restoreDatabase to be available
        let attempts = 0;
        while (typeof (window as any).restoreDatabase !== 'function' && attempts < 50) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }
        
        if (typeof (window as any).restoreDatabase === 'function') {
          const uint8 = new Uint8Array(data);
          await (window as any).restoreDatabase(uint8);
        } else {
          console.error("restoreDatabase not found on window");
        }
      }, binaryArray);
      
      // Reload page so it picks up the DB instead of Setup
      await page.reload();
    }

    await use(page);
  },
});

export { expect };
