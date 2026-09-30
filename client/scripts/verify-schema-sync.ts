import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LARAVEL_DIR = path.resolve(__dirname, '../../laravel-server');
const SCHEMA_FILE = path.resolve(__dirname, '../lib/db/schema.ts');
const SCHEMA_MIGRATIONS_FILE = path.resolve(__dirname, '../lib/db/schema-migrations.ts');

interface Column {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
}

// Ensure the Laravel command works before parsing
function getMySQLSchema(): Column[] {
  console.log('Fetching MySQL schema from Laravel...');
  try {
    const cmd = `php artisan tinker --execute="echo json_encode(DB::select('SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.columns WHERE TABLE_SCHEMA = database()'));"`;
    const output = execSync(cmd, { cwd: LARAVEL_DIR, encoding: 'utf-8' });
    // Output might have some warnings before the JSON array. Find the JSON array.
    const jsonStart = output.indexOf('[');
    const jsonEnd = output.lastIndexOf(']') + 1;
    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error("Could not parse JSON output from artisan tinker.");
    }
    const jsonStr = output.substring(jsonStart, jsonEnd);
    return JSON.parse(jsonStr) as Column[];
  } catch (error) {
    console.error('Error fetching MySQL schema:', error);
    process.exit(1);
  }
}

/** The sync engine does not always write a client table to a server table of
 * the same name: `audit_logs` rows are applied to `activity_logs`, mirroring
 * SyncController's getModelForTable(). A separate, unused MySQL `audit_logs`
 * table also exists, so looking the client name up directly compared against
 * the wrong table entirely. Keep this in step with getModelForTable(). */
const CLIENT_TO_SERVER_TABLE = new Map<string, string>([['audit_logs', 'activity_logs']]);

export function serverTableFor(clientTable: string): string {
  return CLIENT_TO_SERVER_TABLE.get(clientTable) ?? clientTable;
}

function stripSQLComments(block: string): string {
  return block
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

export function parseSQLiteSchema(content: string): Record<string, string[]> {
  const tables: Record<string, string[]> = Object.create(null);

  const tableRegex = /CREATE TABLE IF NOT EXISTS ([a-zA-Z0-9_]+) \(([\s\S]*?)\);/g;
  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1];
    // Inline `-- ...` comments contain commas of their own ("-- 'earned',
    // 'redeemed'"), so splitting the raw block on commas both invented
    // phantom columns and swallowed the real column after the comment.
    const columnsBlock = stripSQLComments(match[2]);

    const columns = columnsBlock.split(',').map(line => {
      const parts = line.trim().split(/\s+/);
      return parts[0].trim();
    }).filter(col => col && col !== 'FOREIGN' && col !== 'PRIMARY' && col !== 'UNIQUE' && col !== 'CHECK');

    tables[tableName] = columns;
  }
  return tables;
}

function getSQLiteSchema(): Record<string, string[]> {
  console.log('Parsing SQLite schema from schema.ts...');
  return parseSQLiteSchema(fs.readFileSync(SCHEMA_FILE, 'utf-8'));
}

function getSyncConfig(): string[] {
  console.log('Extracting STORE_SCOPED_TABLES from schema-migrations.ts...');
  const content = fs.readFileSync(SCHEMA_MIGRATIONS_FILE, 'utf-8');

  // Find the STORE_SCOPED_TABLES block (the canonical list of synced,
  // store-scoped tables - moved here from core.ts's old inline syncColumns
  // array during the sync-engine extraction).
  const configMatch = content.match(/export const STORE_SCOPED_TABLES\s*=\s*\[([\s\S]*?)\];/);
  if (!configMatch) {
    console.error('Could not find STORE_SCOPED_TABLES in schema-migrations.ts');
    process.exit(1);
  }

  return configMatch[1]
    .split(',')
    .map(line => line.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function runVerification() {
  const mysqlCols = getMySQLSchema();
  const sqliteTables = getSQLiteSchema();
  const syncedTables = getSyncConfig();
  
  // Group MySQL columns by table
  const mysqlTables: Record<string, string[]> = {};
  for (const col of mysqlCols) {
    if (!mysqlTables[col.TABLE_NAME]) {
      mysqlTables[col.TABLE_NAME] = [];
    }
    mysqlTables[col.TABLE_NAME].push(col.COLUMN_NAME);
  }
  
  let hasErrors = false;
  let hasWarnings = false;
  
  console.log('\\n--- Validating Synced Tables ---');
  for (const table of syncedTables) {
    const serverTable = serverTableFor(table);
    const serverLabel = serverTable === table ? `'${table}'` : `'${table}' -> server '${serverTable}'`;
    let tableOk = true;
    if (!mysqlTables[serverTable]) {
      console.error(`❌ Table ${serverLabel} is in SYNC_CONFIG but missing from MySQL (Laravel)`);
      hasErrors = true;
      tableOk = false;
    }
    if (!sqliteTables[table]) {
      console.error(`❌ Table '${table}' is in SYNC_CONFIG but missing from SQLite (schema.ts)`);
      hasErrors = true;
      tableOk = false;
    }
    
    if (tableOk) {
      console.log(`✅ Table ${serverLabel} exists in both DBs.`);
      
      // Check for sync tracking columns
      const syncTrackingColumns = ['_version', '_synced_at', 'deleted_at', 'store_id'];
      
      const mysqlTableCols = mysqlTables[serverTable];
      const sqliteTableCols = sqliteTables[table];
      
      for (const reqCol of syncTrackingColumns) {
        if (!mysqlTableCols.includes(reqCol) && reqCol !== '_synced_at' && reqCol !== 'store_id') {
          console.warn(`  ⚠️ MySQL table '${serverTable}' is missing '${reqCol}'`);
          hasWarnings = true;
        }
      }
      
      // Cross check all columns
      const missingInMySQL = sqliteTableCols.filter(c => !mysqlTableCols.includes(c) && c !== '_synced' && c !== '_deleted');
      const missingInSQLite = mysqlTableCols.filter(c => !sqliteTableCols.includes(c) && c !== 'store_id');
      
      if (missingInMySQL.length > 0) {
        console.warn(`  ⚠️ SQLite table '${table}' has columns missing in MySQL '${serverTable}': ${missingInMySQL.join(', ')}`);
        hasWarnings = true;
      }
      if (missingInSQLite.length > 0) {
        console.warn(`  ⚠️ MySQL table '${serverTable}' has columns missing in SQLite '${table}': ${missingInSQLite.join(', ')}`);
        hasWarnings = true;
      }
    }
  }
  
  console.log('\\n--- Summary ---');
  if (hasErrors) {
    console.error('❌ Schema sync validation failed with errors.');
    process.exit(1);
  } else if (hasWarnings) {
    console.warn('⚠️ Schema sync validation completed with warnings.');
  } else {
    console.log('✅ Schema sync validation passed flawlessly!');
  }
}

const invokedDirectly =
  !!process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) runVerification();
