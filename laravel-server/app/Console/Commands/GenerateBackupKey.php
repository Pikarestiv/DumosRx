<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class GenerateBackupKey extends Command
{
    protected $signature = 'backups:keygen';

    protected $description = 'Print a new backup encryption key pair. Run it on your own machine, never on the server.';

    public function handle(): int
    {
        $keypair = sodium_crypto_box_keypair();

        $this->line('BACKUP_ENCRYPTION_PUBLIC_KEY (goes in the server .env):');
        $this->line(base64_encode(sodium_crypto_box_publickey($keypair)));
        $this->newLine();
        $this->line('KEY PAIR (keep it offline, in a password manager; needed for backups:decrypt, never on the server):');
        $this->line(base64_encode($keypair));

        return self::SUCCESS;
    }
}
