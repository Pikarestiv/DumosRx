import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LARAVEL_DIR = path.resolve(__dirname, '../../laravel-server');
const SCHEMA_FILE = path.resolve(__dirname, '../lib/db/schema.ts');
const CORE_FILE = path.resolve(__dirname, '../lib/db/core.ts');

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

function getSQLiteSchema(): Record<string, string[]> {
  console.log('Parsing SQLite schema from schema.ts...');
  const content = fs.readFileSync(SCHEMA_FILE, 'utf-8');
  const tables: Record<string, string[]> = {};
  
  // Extract CREATE TABLE blocks
  const tableRegex = /CREATE TABLE IF NOT EXISTS ([a-zA-Z0-9_]+) \(([\s\S]*?)\);/g;
  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const columnsBlock = match[2];
    
    // Extract column names
    const columns = columnsBlock.split(',').map(line => {
      const parts = line.trim().split(' ');
      return parts[0].trim();
    }).filter(col => col && col !== 'FOREIGN' && col !== 'PRIMARY' && col !== 'UNIQUE');
    
    tables[tableName] = columns;
  }
  return tables;
}

function getSyncConfig(): string[] {
  console.log('Extracting syncColumns from core.ts...');
  const content = fs.readFileSync(CORE_FILE, 'utf-8');
  
  // Find the syncColumns block
  const configMatch = content.match(/const syncColumns\s*=\s*\[([\s\S]*?)\];/);
  if (!configMatch) {
    console.error('Could not find syncColumns in core.ts');
    process.exit(1);
  }
  
  // Very rudimentary parsing to extract table names
  const tableMatches = configMatch[1].match(/table:\s*['"]([^'"]+)['"]/g);
  if (!tableMatches) return [];
  
  return tableMatches.map(m => {
    const execMatch = /table:\s*['"]([^'"]+)['"]/.exec(m);
    return execMatch ? execMatch[1] : '';
  }).filter(Boolean);
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
    let tableOk = true;
    if (!mysqlTables[table]) {
      console.error(`❌ Table '${table}' is in SYNC_CONFIG but missing from MySQL (Laravel)`);
      hasErrors = true;
      tableOk = false;
    }
    if (!sqliteTables[table]) {
      console.error(`❌ Table '${table}' is in SYNC_CONFIG but missing from SQLite (schema.ts)`);
      hasErrors = true;
      tableOk = false;
    }
    
    if (tableOk) {
      console.log(`✅ Table '${table}' exists in both DBs.`);
      
      // Check for sync tracking columns
      const syncTrackingColumns = ['_version', '_synced_at', 'deleted_at', 'store_id'];
      
      const mysqlTableCols = mysqlTables[table];
      const sqliteTableCols = sqliteTables[table];
      
      for (const reqCol of syncTrackingColumns) {
        if (!mysqlTableCols.includes(reqCol) && reqCol !== '_synced_at' && reqCol !== 'store_id') {
          console.warn(`  ⚠️ MySQL table '${table}' is missing '${reqCol}'`);
          hasWarnings = true;
        }
      }
      
      // Cross check all columns
      const missingInMySQL = sqliteTableCols.filter(c => !mysqlTableCols.includes(c) && c !== '_synced' && c !== '_deleted');
      const missingInSQLite = mysqlTableCols.filter(c => !sqliteTableCols.includes(c) && c !== 'store_id');
      
      if (missingInMySQL.length > 0) {
        console.warn(`  ⚠️ SQLite table '${table}' has columns missing in MySQL: ${missingInMySQL.join(', ')}`);
        hasWarnings = true;
      }
      if (missingInSQLite.length > 0) {
        console.warn(`  ⚠️ MySQL table '${table}' has columns missing in SQLite: ${missingInSQLite.join(', ')}`);
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

runVerification();
