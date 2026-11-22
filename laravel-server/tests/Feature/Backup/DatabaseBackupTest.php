<?php

namespace Tests\Feature\Backup;

use App\Mail\SuperAdminAlertMail;
use App\Services\Backup\BackupEncryptor;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DatabaseBackupTest extends TestCase
{
    private string $keypair;

    private string $publicKey;

    protected function setUp(): void
    {
        parent::setUp();

        $this->keypair = sodium_crypto_box_keypair();
        $this->publicKey = sodium_crypto_box_publickey($this->keypair);
        Storage::fake('r2_backups');
        config([
            'database_backup.bucket' => 'dumosrx-db-backups',
            'database_backup.public_key' => base64_encode($this->publicKey),
            'database_backup.min_bytes' => 16,
        ]);
        DB::statement('create table backup_probe (id integer primary key, note text, amount real, blob_value text)');
        DB::table('backup_probe')->insert([
            ['id' => 1, 'note' => "it's a \"quoted\"\nmultiline note", 'amount' => 12.5, 'blob_value' => null],
            ['id' => 2, 'note' => 'Ünïcødé ₦', 'amount' => 0, 'blob_value' => 'x'],
        ]);
    }

    private function restoredProbeRows(string $encryptedPath): array
    {
        $plain = tempnam(sys_get_temp_dir(), 'drx-test-');
        app(BackupEncryptor::class)->decryptFile($encryptedPath, $plain, $this->keypair);
        $sql = implode('', gzfile($plain));
        unlink($plain);

        $restored = new \PDO('sqlite::memory:');
        $restored->exec(str_replace(['SET FOREIGN_KEY_CHECKS=0;', 'SET FOREIGN_KEY_CHECKS=1;'], '', $sql));

        return $restored->query('select id, note, amount, blob_value from backup_probe order by id')->fetchAll(\PDO::FETCH_ASSOC);
    }

    public function test_the_command_writes_a_backup_that_restores_to_the_same_rows(): void
    {
        $this->artisan('backups:database')->assertSuccessful();

        $keys = Storage::disk('r2_backups')->allFiles('daily');
        $this->assertCount(1, $keys);

        $rows = $this->restoredProbeRows(Storage::disk('r2_backups')->path($keys[0]));
        $this->assertSame("it's a \"quoted\"\nmultiline note", $rows[0]['note']);
        $this->assertNull($rows[0]['blob_value']);
        $this->assertSame('Ünïcødé ₦', $rows[1]['note']);
        $this->assertCount(2, $rows);
    }

    public function test_the_first_of_the_month_also_keeps_a_monthly_copy(): void
    {
        $result = app(\App\Services\Backup\DatabaseBackupService::class)->run(Carbon::parse('2026-12-01 23:00:00', 'Africa/Lagos'));

        $this->assertSame('daily/2026/12/backup-01-12-2026_23-00.sql.gz.enc', $result['key']);
        $this->assertSame('monthly/monthly-01-12-2026_23-00.sql.gz.enc', $result['monthly_key']);
        Storage::disk('r2_backups')->assertExists('monthly/monthly-01-12-2026_23-00.sql.gz.enc');
        $this->assertSame(
            Storage::disk('r2_backups')->get($result['key']),
            Storage::disk('r2_backups')->get($result['monthly_key']),
        );
    }

    public function test_prune_removes_daily_backups_7_days_old_and_monthly_backups_6_months_old(): void
    {
        $disk = Storage::disk('r2_backups');
        $now = Carbon::parse('2026-12-15 23:00:00', 'Africa/Lagos');

        $oldDaily = 'daily/2026/12/backup-08-12-2026_23-00.sql.gz.enc';
        $recentDaily = 'daily/2026/12/backup-10-12-2026_23-00.sql.gz.enc';
        $oldMonthly = 'monthly/monthly-01-06-2026_23-00.sql.gz.enc';
        $recentMonthly = 'monthly/monthly-01-08-2026_23-00.sql.gz.enc';

        $disk->put($oldDaily, 'old-daily');
        $disk->put($recentDaily, 'recent-daily');
        $disk->put($oldMonthly, 'old-monthly');
        $disk->put($recentMonthly, 'recent-monthly');

        touch($disk->path($oldDaily), $now->copy()->subDays(7)->getTimestamp());
        touch($disk->path($recentDaily), $now->copy()->subDays(5)->getTimestamp());
        touch($disk->path($oldMonthly), $now->copy()->subMonthsNoOverflow(6)->getTimestamp());
        touch($disk->path($recentMonthly), $now->copy()->subMonthsNoOverflow(4)->getTimestamp());

        $pruned = app(\App\Services\Backup\DatabaseBackupService::class)->prune($now);

        $this->assertSame(['daily_deleted' => 1, 'monthly_deleted' => 1], $pruned);
        $disk->assertMissing($oldDaily);
        $disk->assertExists($recentDaily);
        $disk->assertMissing($oldMonthly);
        $disk->assertExists($recentMonthly);
    }

    public function test_other_days_write_only_the_daily_copy(): void
    {
        $result = app(\App\Services\Backup\DatabaseBackupService::class)->run(Carbon::parse('2026-12-02 23:00:00', 'Africa/Lagos'));

        $this->assertNull($result['monthly_key']);
        $this->assertSame([], Storage::disk('r2_backups')->allFiles('monthly'));
    }

    public function test_it_does_nothing_until_a_bucket_and_public_key_are_configured(): void
    {
        config(['database_backup.public_key' => null]);

        $this->artisan('backups:database')->assertSuccessful();

        $this->assertSame([], Storage::disk('r2_backups')->allFiles());
    }

    public function test_a_failed_backup_fails_the_command_and_emails_the_admins(): void
    {
        config(['dumos.admin_emails' => ['ops@dumosrx.com'], 'database_backup.min_bytes' => 10_000_000]);
        Mail::fake();

        $this->artisan('backups:database')->assertFailed();

        $this->assertSame([], Storage::disk('r2_backups')->allFiles());
        Mail::assertSent(SuperAdminAlertMail::class);
    }

    public function test_an_invalid_public_key_is_refused_before_anything_is_dumped(): void
    {
        config(['database_backup.public_key' => 'not-a-key', 'dumos.admin_emails' => []]);

        $this->artisan('backups:database')->assertFailed();

        $this->assertSame([], Storage::disk('r2_backups')->allFiles());
    }

    public function test_the_decrypt_command_restores_a_downloaded_backup_with_the_secret_key(): void
    {
        $this->artisan('backups:database')->assertSuccessful();
        $source = Storage::disk('r2_backups')->path(Storage::disk('r2_backups')->allFiles('daily')[0]);
        $keyFile = tempnam(sys_get_temp_dir(), 'drx-key-');
        $destination = tempnam(sys_get_temp_dir(), 'drx-out-');
        file_put_contents($keyFile, base64_encode($this->keypair));

        $this->artisan('backups:decrypt', ['source' => $source, 'destination' => $destination, '--secret-key-file' => $keyFile])->assertSuccessful();

        $this->assertStringContainsString('CREATE TABLE', implode('', gzfile($destination)));
    }

    public function test_a_generated_key_pair_produces_a_public_key_the_backup_accepts(): void
    {
        $this->artisan('backups:keygen')->assertSuccessful();

        $pair = sodium_crypto_box_keypair();
        config(['database_backup.public_key' => base64_encode(sodium_crypto_box_publickey($pair))]);

        $this->artisan('backups:database')->assertSuccessful();
    }
}
