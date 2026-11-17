<?php

namespace Tests\Feature\Backup;

use App\Services\Backup\BackupEncryptor;
use RuntimeException;
use Tests\TestCase;

class BackupEncryptorTest extends TestCase
{
    private string $keypair;

    private string $source;

    private string $encrypted;

    private string $decrypted;

    protected function setUp(): void
    {
        parent::setUp();
        $this->keypair = sodium_crypto_box_keypair();
        $this->source = tempnam(sys_get_temp_dir(), 'drx-src-');
        $this->encrypted = tempnam(sys_get_temp_dir(), 'drx-enc-');
        $this->decrypted = tempnam(sys_get_temp_dir(), 'drx-dec-');
    }

    protected function tearDown(): void
    {
        array_map('unlink', [$this->source, $this->encrypted, $this->decrypted]);
        parent::tearDown();
    }

    private function encrypt(string $plaintext): void
    {
        file_put_contents($this->source, $plaintext);
        (new BackupEncryptor)->encryptFile($this->source, $this->encrypted, sodium_crypto_box_publickey($this->keypair));
    }

    public function test_it_round_trips_data_spanning_several_chunks(): void
    {
        $plaintext = random_bytes(65536 * 3 + 123);
        $this->encrypt($plaintext);

        (new BackupEncryptor)->decryptFile($this->encrypted, $this->decrypted, $this->keypair);

        $this->assertSame($plaintext, file_get_contents($this->decrypted));
    }

    public function test_it_round_trips_an_empty_file_and_an_exact_chunk_multiple(): void
    {
        foreach (['', str_repeat('a', 65536 * 2)] as $plaintext) {
            $this->encrypt($plaintext);
            (new BackupEncryptor)->decryptFile($this->encrypted, $this->decrypted, $this->keypair);
            $this->assertSame($plaintext, file_get_contents($this->decrypted));
        }
    }

    public function test_the_server_side_public_key_alone_cannot_decrypt(): void
    {
        $this->encrypt('secret rows');
        $publicOnly = sodium_crypto_box_publickey($this->keypair);

        $this->expectException(\Throwable::class);
        (new BackupEncryptor)->decryptFile($this->encrypted, $this->decrypted, $publicOnly);
    }

    public function test_a_different_key_pair_is_refused(): void
    {
        $this->encrypt('secret rows');

        $this->expectException(RuntimeException::class);
        (new BackupEncryptor)->decryptFile($this->encrypted, $this->decrypted, sodium_crypto_box_keypair());
    }

    public function test_a_tampered_backup_is_refused(): void
    {
        $this->encrypt(str_repeat('row;', 5000));
        $bytes = file_get_contents($this->encrypted);
        $bytes[strlen($bytes) - 20] = $bytes[strlen($bytes) - 20] ^ "\x01";
        file_put_contents($this->encrypted, $bytes);

        $this->expectException(RuntimeException::class);
        (new BackupEncryptor)->decryptFile($this->encrypted, $this->decrypted, $this->keypair);
    }

    public function test_a_truncated_backup_is_refused(): void
    {
        $this->encrypt(random_bytes(65536 * 2));
        file_put_contents($this->encrypted, substr(file_get_contents($this->encrypted), 0, -30000));

        $this->expectException(RuntimeException::class);
        (new BackupEncryptor)->decryptFile($this->encrypted, $this->decrypted, $this->keypair);
    }
}
