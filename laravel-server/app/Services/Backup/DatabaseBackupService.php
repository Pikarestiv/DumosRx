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

    public const SCHEDULE_CONFIG_KEY = 'database_backup_schedule';

    public const DAILY_RETENTION_DAYS = 7;

    public const MONTHLY_RETENTION_MONTHS = 6;

    /** @var array<int, string> */
    public const FREQUENCIES = ['daily', 'weekly', 'monthly'];

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

    /** @return array{enabled: bool, frequency: string} */
    public function scheduleSettings(): array
    {
        $defaults = ['enabled' => true, 'frequency' => 'daily'];
        if (! Schema::hasTable('system_configs')) {
            return $defaults;
        }

        $value = SystemConfig::getVal(self::SCHEDULE_CONFIG_KEY);
        if (! is_array($value)) {
            return $defaults;
        }

        $frequency = in_array($value['frequency'] ?? null, self::FREQUENCIES, true)
            ? (string) $value['frequency']
            : 'daily';

        return [
            'enabled' => (bool) ($value['enabled'] ?? true),
            'frequency' => $frequency,
        ];
    }

    /** @return array{enabled: bool, frequency: string} */
    public function updateScheduleSettings(bool $enabled, string $frequency): array
    {
        $normalized = in_array($frequency, self::FREQUENCIES, true) ? $frequency : 'daily';
        $payload = ['enabled' => $enabled, 'frequency' => $normalized];

        if (Schema::hasTable('system_configs')) {
            SystemConfig::setVal(
                self::SCHEDULE_CONFIG_KEY,
                $payload,
                'Automatic database backup schedule (enabled toggle and frequency).',
            );
        }

        return $payload;
    }

    public function shouldRunScheduled(CarbonInterface $at): bool
    {
        $settings = $this->scheduleSettings();
        if (! $settings['enabled']) {
            return false;
        }

        return match ($settings['frequency']) {
            'weekly' => $at->isSunday(),
            'monthly' => $at->day === 1,
            default => true,
        };
    }

    public function scheduleSummary(): string
    {
        $settings = $this->scheduleSettings();
        if (! $settings['enabled']) {
            return 'Manual only (scheduled backups paused)';
        }

        return match ($settings['frequency']) {
            'weekly' => 'Weekly (Sundays) at 23:00 Africa/Lagos',
            'monthly' => 'Monthly (1st) at 23:00 Africa/Lagos',
            default => 'Daily at 23:00 Africa/Lagos',
        };
    }

    /** @return array{key: string, bytes: int, monthly_key: string|null, pruned: array{daily_deleted: int, monthly_deleted: int}} */
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

            $stamp = $at->format('d-m-Y_H-i');
            $key = 'daily/'.$at->format('Y/m/')."backup-{$stamp}.sql.gz.enc";
            $bytes = (int) filesize($encrypted);
            $this->upload($key, $encrypted, $bytes);

            $monthlyKey = $at->day === 1 ? "monthly/monthly-{$stamp}.sql.gz.enc" : null;
            if ($monthlyKey !== null) {
                $this->upload($monthlyKey, $encrypted, $bytes);
            }

            $pruned = $this->prune($at);

            return ['key' => $key, 'bytes' => $bytes, 'monthly_key' => $monthlyKey, 'pruned' => $pruned];
        } finally {
            @unlink($plain);
            @unlink($encrypted);
        }
    }

    /** @return array{daily_deleted: int, monthly_deleted: int} */
    public function prune(CarbonInterface $at): array
    {
        return [
            'daily_deleted' => $this->prunePrefix(
                'daily',
                $at->copy()->subDays(self::DAILY_RETENTION_DAYS)->getTimestamp(),
            ),
            'monthly_deleted' => $this->prunePrefix(
                'monthly',
                $at->copy()->subMonthsNoOverflow(self::MONTHLY_RETENTION_MONTHS)->getTimestamp(),
            ),
        ];
    }

    private function prunePrefix(string $prefix, int $cutoffTimestamp): int
    {
        $disk = $this->disk();
        $files = $disk->allFiles($prefix);
        if (count($files) <= 1) {
            return 0;
        }

        usort($files, fn (string $a, string $b) => $disk->lastModified($b) <=> $disk->lastModified($a));

        $deleted = 0;
        foreach (array_slice($files, 1) as $file) {
            if ($disk->lastModified($file) <= $cutoffTimestamp && $disk->delete($file)) {
                $deleted++;
            }
        }

        return $deleted;
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
