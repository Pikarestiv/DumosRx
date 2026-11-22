<?php

namespace App\Services\Backup;

use App\Models\SystemConfig;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class DatabaseBackupService
{
    public const LAST_RUN_CONFIG_KEY = 'database_backup_last_run';

    public function __construct(
        private readonly DatabaseDumper $dumper,
        private readonly BackupEncryptor $encryptor,
    ) {}

    public function isConfigured(): bool
    {
        return filled(config('database_backup.bucket')) && filled(config('database_backup.public_key'));
    }

    public function disk(): Filesystem
    {
        return Storage::disk(config('database_backup.disk'));
    }

    /** @param array{key?: string, bytes?: int, monthly_key?: string|null}|null $result */
    public function recordLastRun(string $status, string $trigger, ?array $result = null, ?string $error = null): void
    {
        if (! Schema::hasTable('system_configs')) {
            return;
        }

        SystemConfig::setVal(
            self::LAST_RUN_CONFIG_KEY,
            [
                'status' => $status,
                'trigger' => $trigger,
                'ran_at' => now('UTC')->toIso8601String(),
                'key' => $result['key'] ?? null,
                'bytes' => $result['bytes'] ?? null,
                'monthly_key' => $result['monthly_key'] ?? null,
                'error' => $error,
            ],
            'Latest database backup execution status and timestamp.',
        );
    }

    public function lastRun(): ?array
    {
        if (! Schema::hasTable('system_configs')) {
            return null;
        }

        $value = SystemConfig::getVal(self::LAST_RUN_CONFIG_KEY);

        return is_array($value) ? $value : null;
    }

    /** @return array{key: string, bytes: int, monthly_key: string|null} */
    public function run(CarbonInterface $at): array
    {
        $publicKey = (string) base64_decode((string) config('database_backup.public_key'), true);
        if (strlen($publicKey) !== SODIUM_CRYPTO_BOX_PUBLICKEYBYTES) {
            throw new RuntimeException('BACKUP_ENCRYPTION_PUBLIC_KEY is not a valid base64 libsodium public key.');
        }

        $plain = tempnam(sys_get_temp_dir(), 'drx-dump-');
        $encrypted = tempnam(sys_get_temp_dir(), 'drx-enc-');

        try {
            $this->dumper->dumpTo($plain);
            $this->encryptor->encryptFile($plain, $encrypted, $publicKey);

            $key = 'daily/'.$at->format('Y/m/Ymd-His').'.sql.gz.enc';
            $bytes = (int) filesize($encrypted);
            $this->upload($key, $encrypted, $bytes);

            $monthlyKey = $at->day === 1 ? 'monthly/'.$at->format('Y-m').'.sql.gz.enc' : null;
            if ($monthlyKey !== null) {
                $this->upload($monthlyKey, $encrypted, $bytes);
            }

            return ['key' => $key, 'bytes' => $bytes, 'monthly_key' => $monthlyKey];
        } finally {
            @unlink($plain);
            @unlink($encrypted);
        }
    }

    private function upload(string $key, string $path, int $bytes): void
    {
        $minBytes = (int) config('database_backup.min_bytes');
        if ($bytes < $minBytes) {
            throw new RuntimeException("The encrypted backup is only {$bytes} bytes; refusing to upload a backup under {$minBytes}.");
        }

        $stream = fopen($path, 'rb');
        $this->disk()->writeStream($key, $stream);
        if (is_resource($stream)) {
            fclose($stream);
        }

        $stored = $this->disk()->size($key);
        if ($stored !== $bytes) {
            throw new RuntimeException("Uploaded {$key} is {$stored} bytes but {$bytes} were sent.");
        }
    }
}
