<?php

namespace App\Services\Backup;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class DatabaseDumper
{
    private const ROWS_PER_CHUNK = 500;

    /** Writes a gzipped SQL dump of every table to $path from one consistent snapshot. */
    public function dumpTo(string $path): void
    {
        $handle = gzopen($path, 'wb6');
        if ($handle === false) {
            throw new RuntimeException("Cannot open {$path} for writing.");
        }

        try {
            gzwrite($handle, "SET FOREIGN_KEY_CHECKS=0;\n");
            DB::transaction(function () use ($handle) {
                foreach ($this->tables() as $table) {
                    $this->writeTable($handle, $table);
                }
            });
            gzwrite($handle, "SET FOREIGN_KEY_CHECKS=1;\n");
        } finally {
            gzclose($handle);
        }
    }

    /** @return array<int, string> */
    private function tables(): array
    {
        $connection = DB::connection();
        $inThisDatabase = fn (array $table) => $connection->getDriverName() !== 'mysql' || $table['schema'] === $connection->getDatabaseName();

        return array_values(array_map(fn ($table) => $table['name'], array_filter(Schema::getTables(), $inThisDatabase)));
    }

    /** @param resource $handle */
    private function writeTable($handle, string $table): void
    {
        $quoted = $this->quoteIdentifier($table);
        gzwrite($handle, "DROP TABLE IF EXISTS {$quoted};\n".$this->createStatement($table).";\n");

        $order = $this->orderColumns($table);
        $offset = 0;
        do {
            $query = DB::table($table);
            foreach ($order as $column) {
                $query->orderBy($column);
            }
            $rows = $query->offset($offset)->limit(self::ROWS_PER_CHUNK)->get();
            foreach ($rows as $row) {
                gzwrite($handle, $this->insertStatement($quoted, (array) $row));
            }
            $offset += self::ROWS_PER_CHUNK;
        } while ($rows->count() === self::ROWS_PER_CHUNK);
    }

    private function createStatement(string $table): string
    {
        $connection = DB::connection();
        if ($connection->getDriverName() === 'mysql') {
            return (string) array_values((array) $connection->selectOne('SHOW CREATE TABLE '.$this->quoteIdentifier($table)))[1];
        }

        return (string) $connection->selectOne('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?', ['table', $table])->sql;
    }

    /** @return array<int, string> */
    private function orderColumns(string $table): array
    {
        foreach (Schema::getIndexes($table) as $index) {
            if ($index['primary']) {
                return $index['columns'];
            }
        }

        return [];
    }

    /** @param array<string, mixed> $row */
    private function insertStatement(string $quotedTable, array $row): string
    {
        $pdo = DB::connection()->getPdo();
        $columns = implode(', ', array_map(fn ($name) => $this->quoteIdentifier($name), array_keys($row)));
        $values = implode(', ', array_map(fn ($value) => match (true) {
            $value === null => 'NULL',
            is_int($value), is_float($value) => (string) $value,
            default => $pdo->quote((string) $value),
        }, array_values($row)));

        return "INSERT INTO {$quotedTable} ({$columns}) VALUES ({$values});\n";
    }

    private function quoteIdentifier(string $name): string
    {
        return '`'.str_replace('`', '``', $name).'`';
    }
}
