<?php

namespace Tests\Concerns;

/**
 * For the handful of tests that need a real MySQL connection because the
 * behavior under test (row locking, column width enforcement, ...) is
 * something SQLite doesn't actually enforce, regardless of what the schema
 * declares. `phpunit.xml` forces `DB_CONNECTION=sqlite`/`DB_DATABASE=:memory:`
 * for the whole run, which also clobbers `config('database.connections.mysql')`
 * since that config reads the same `DB_DATABASE` env var - so the real
 * credentials are read straight out of `.env` instead.
 */
trait ConnectsToRealMysql
{
    private function readRealMysqlCredentialsFromDotEnv(): array
    {
        $defaults = [
            'host' => '127.0.0.1',
            'port' => '3306',
            'database' => 'dumosrx',
            'username' => 'root',
            'password' => '',
        ];

        $envPath = base_path('.env');
        if (is_readable($envPath)) {
            foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                if (!str_contains($line, '=') || str_starts_with(trim($line), '#')) {
                    continue;
                }
                [$key, $value] = array_map('trim', explode('=', $line, 2));
                $value = trim($value, "\"'");
                match ($key) {
                    'DB_HOST' => $defaults['host'] = $value,
                    'DB_PORT' => $defaults['port'] = $value,
                    'DB_DATABASE' => $defaults['database'] = $value,
                    'DB_USERNAME' => $defaults['username'] = $value,
                    'DB_PASSWORD' => $defaults['password'] = $value,
                    default => null,
                };
            }
        }

        return [
            'driver' => 'mysql',
            'host' => $defaults['host'],
            'port' => $defaults['port'],
            'database' => $defaults['database'],
            'username' => $defaults['username'],
            'password' => $defaults['password'],
            'charset' => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix' => '',
        ];
    }
}
