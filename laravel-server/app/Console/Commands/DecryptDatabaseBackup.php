<?php

namespace App\Console\Commands;

use App\Services\Backup\BackupEncryptor;
use Illuminate\Console\Command;
use Throwable;

class DecryptDatabaseBackup extends Command
{
    protected $signature = 'backups:decrypt {source : Encrypted backup file} {destination : Where to write the .sql.gz} {--secret-key-file= : File holding the base64 libsodium key pair}';

    protected $description = 'Decrypt a downloaded database backup for a restore. Run it on your own machine, never on the server.';

    public function handle(BackupEncryptor $encryptor): int
    {
        $keyFile = (string) $this->option('secret-key-file');
        if (! is_file($keyFile)) {
            $this->error('Pass --secret-key-file pointing at the file that holds your base64 key pair.');

            return self::FAILURE;
        }

        try {
            $encryptor->decryptFile($this->argument('source'), $this->argument('destination'), (string) base64_decode(trim((string) file_get_contents($keyFile)), true));
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info('Decrypted to '.$this->argument('destination'));

        return self::SUCCESS;
    }
}
