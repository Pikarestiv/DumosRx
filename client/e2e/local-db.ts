import fs from 'fs';
import path from 'path';
import initSqlJs, { type SqlValue } from 'sql.js';
import { expect, type Browser, type Page } from '@playwright/test';
import { writeLocalDbBinary } from './fixtures';

export type SeedStatement = [sql: string, params?: SqlValue[]];

const FIXTURE_PATH = path.join(__dirname, '.auth', 'test-db.bin');
let migratedFixture: Promise<number[]> | null = null;

async function exportLiveDb(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const bin = window.getDatabaseBinary?.();
    if (!bin) throw new Error('getDatabaseBinary dev hook is missing or the DB is not open.');
    return Array.from(bin);
  });
}

// The checked-in fixture predates newer tables (services, sale_services...), so boot it once
// per worker to let the app's own migrations run, then seed rows into that migrated copy.
async function bootMigratedFixture(browser: Browser, baseURL: string | undefined): Promise<number[]> {
  const context = await browser.newContext({ baseURL });
  await context.route(/https:\/\/(api\.)?(dev\.)?dumosrx\.com/, (route) => route.abort('blockedbyclient'));
  const page = await context.newPage();
  await page.goto('/manifest.json');
  await writeLocalDbBinary(page, Array.from(fs.readFileSync(FIXTURE_PATH)));
  await page.goto('/login');
  await expect(page.getByText('Initializing workspace...')).toBeHidden({ timeout: 30000 });
  await expect(page.getByPlaceholder('admin')).toBeVisible({ timeout: 30000 });
  await expect.poll(() => exportLiveDb(page).then((b) => b.length > 0), { timeout: 15000 }).toBe(true);
  const binary = await exportLiveDb(page);
  await context.close();
  return binary;
}

export function getMigratedFixture(browser: Browser, baseURL: string | undefined): Promise<number[]> {
  migratedFixture ??= bootMigratedFixture(browser, baseURL);
  return migratedFixture;
}

export async function applySeed(binary: number[], statements: SeedStatement[]): Promise<number[]> {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(binary));
  for (const [sql, params] of statements) db.run(sql, params ?? []);
  const out = Array.from(db.export());
  db.close();
  return out;
}

export async function seedLocalDb(page: Page, browser: Browser, baseURL: string | undefined, statements: SeedStatement[]) {
  const seeded = await applySeed(await getMigratedFixture(browser, baseURL), statements);
  await page.goto('/manifest.json');
  await writeLocalDbBinary(page, seeded);
}

export async function queryLocalDb<T = Record<string, SqlValue>>(
  page: Page,
  sql: string,
  params: SqlValue[] = [],
): Promise<T[]> {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(await exportLiveDb(page)));
  const stmt = db.prepare(sql, params);
  const rows: T[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as T);
  stmt.free();
  db.close();
  return rows;
}

export async function storeIdOf(binary: number[]): Promise<string> {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(binary));
  const id = db.exec('SELECT id FROM stores LIMIT 1')[0].values[0][0] as string;
  db.close();
  return id;
}
