# DumosRx Data Migration Guide

## Overview
This guide details the process of migrating data from the legacy NestJS/Supabase (PostgreSQL) backend to the new Laravel (MySQL) backend.

## Scope
The following entities must be migrated:
1. **Users & Auth**: `users`, `roles`
2. **Inventory**: `categories`, `suppliers`, `medicines`, `inventory`
3. **Sales**: `customers`, `sales`, `sale_items`, `prescriptions`

## Type Conversion Strategy

### UUIDs
Both systems use UUIDs.
- **Postgres**: Native `UUID` type.
- **MySQL**: `CHAR(36)` (Laravel default for UUIDs).

### JSON/JSONB
- **Postgres**: Uses `JSONB` for binary JSON storage.
- **MySQL**: Uses `JSON` column type (supported in MySQL 5.7.8+).
- **Action**: Export `JSONB` columns as standard JSON text. Laravel's Eloquent casts will handle them as arrays automatically.

### Booleans
- **Postgres**: `t`/`f`.
- **MySQL**: `1`/`0` (TINYINT).
- **Action**: Ensure export script converts `true`/`false` literals to `1`/`0`.

## Migration Steps

### 1. Export from Supabase (Postgres)
Use `pg_dump` with data-only flag or a custom SQL query to export to CSV/JSON.
```sql
COPY (SELECT * FROM users) TO '/tmp/users.csv' DELIMITER ',' CSV HEADER;
-- Repeat for all tables
```

### 2. Transform Data
- Map `role` string in `users` to `role_id` if strictly enforcing the new `roles` table. 
- *Note*: The new `users` table retains a `role` string column for backward compatibility, so direct copy works too.

### 3. Import to MySQL
Use `LOAD DATA INFILE` or a Laravel Seeder.
Recommended: Create a specific Seeder `database/seeders/LegacyDataSeeder.php` that reads the exported CSVs and inserts them using Eloquent to ensure timestamps and UUIDs are handled correctly.

## Sync Strategy (Offline-First)

### Conflict Resolution: Last-Write-Wins
When syncing data between the Offline Desktop App (Tauri/SQLite) and the Cloud Backend (Laravel/MySQL):
1. **Timestamps**: Compare `updated_at`.
2. **Logic**: If the Cloud record has a newer `updated_at`, it overwrites the Local record. If Local is newer, it overwrites Cloud.
3. **Queue**: Offline actions should be queued locally and processed sequentially when online.

### Schema Mapping (SQLite <-> MySQL)
Tauri uses SQLite. Ensure migrations in Tauri mirror the Laravel migrations exactly.
- **Indices**: Ensure `barcode` and `name` are indexed in SQLite for fast POS lookups.
