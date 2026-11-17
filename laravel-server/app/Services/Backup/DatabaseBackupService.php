<?php

namespace App\Services\Backup;

use Carbon\CarbonInterface;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class DatabaseBackupService
{
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
