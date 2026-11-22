<?php

namespace Tests\Feature;

use App\Mail\SuperAdminAlertMail;
use App\Models\ActivityLog;
use App\Models\DownloadLog;
use App\Models\Feedback;
use App\Models\OnlineOrder;
use App\Models\PaymentTransaction;
use App\Models\Sale;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\SyncFailure;
use App\Models\SyncHealthDaily;
use App\Models\User;
use App\Models\UserDevice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AdminDailySummaryCommandTest extends TestCase
{
    use RefreshDatabase;

    private function createOwner(string $email, ?Carbon $createdAt = null): User
    {
        $user = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => $email,
            'password' => bcrypt('password'),
            'role' => 'store_owner',
            'is_active' => true,
        ]);

        if ($createdAt) {
            DB::table('users')->where('id', $user->id)->update([
                'created_at' => $createdAt->copy()->utc(),
                'updated_at' => $createdAt->copy()->utc(),
            ]);
        }

        return $user;
    }

    public function test_daily_summary_omits_zero_downloads_and_reports_pwa_commerce_and_health(): void
    {
        config([
            'dumos.admin_emails' => ['founder@dumosrx.com'],
            'app.frontend_url' => 'https://dumosrx.com',
        ]);
        Mail::fake();

        $lagosNow = Carbon::parse('2026-11-22 08:00:00', 'Africa/Lagos');
        $this->travelTo($lagosNow->copy()->utc());
        $yesterdayLagos = Carbon::parse('2026-11-21 15:30:00', 'Africa/Lagos');
        $yesterdayUtc = $yesterdayLagos->copy()->utc();

        $owner = $this->createOwner('grace@example.com', $yesterdayLagos);
        $demoOwner = $this->createOwner('demo@example.com');

        $liveStore = Store::create([
            'name' => 'Grace Pharmacy',
            'user_id' => $owner->id,
            'currency' => 'NGN',
            'is_demo' => false,
            'device_id' => 'DRX-STORE1',
            'last_sync_at' => $yesterdayUtc,
        ]);

        $demoStore = Store::create([
            'name' => 'Demo Store',
            'user_id' => $demoOwner->id,
            'currency' => 'NGN',
            'is_demo' => true,
            'device_id' => 'DRX-DEMO',
            'last_sync_at' => $yesterdayUtc,
        ]);

        $staff = User::create([
            'first_name' => 'Cashier',
            'last_name' => 'One',
            'email' => 'cashier@example.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $liveStore->id,
            'is_active' => true,
        ]);

        UserDevice::create([
            'user_id' => $owner->id,
            'store_id' => $liveStore->id,
            'device_id' => 'DRX-PWA-1',
            'device_label' => 'Edge on iOS',
            'app_version' => '0.0.48',
            'build_sha' => 'abcdef1234',
            'last_synced_at' => $yesterdayUtc,
        ]);
        UserDevice::create([
            'user_id' => $staff->id,
            'store_id' => $liveStore->id,
            'device_id' => 'DRX-PWA-1',
            'device_label' => 'Edge on iOS',
            'app_version' => '0.0.48',
            'build_sha' => 'abcdef1234',
            'last_synced_at' => $yesterdayUtc,
        ]);
        UserDevice::create([
            'user_id' => $owner->id,
            'store_id' => $liveStore->id,
            'device_id' => 'DRX-DESK-1',
            'device_label' => 'Desktop App (Windows)',
            'app_version' => '0.0.47',
            'last_synced_at' => $yesterdayUtc,
        ]);

        $sale = Sale::create([
            'store_id' => $liveStore->id,
            'cashier_id' => $owner->id,
            'subtotal' => 15000,
            'total_amount' => 15000,
            'payment_method' => 'cash',
            'payment_status' => 'completed',
            'amount_paid' => 15000,
            'transaction_date' => $yesterdayUtc,
        ]);
        DB::table('sales')->where('id', $sale->id)->update(['created_at' => $yesterdayUtc]);

        $voidSale = Sale::create([
            'store_id' => $liveStore->id,
            'cashier_id' => $owner->id,
            'subtotal' => 99999,
            'total_amount' => 99999,
            'payment_method' => 'cash',
            'payment_status' => 'completed',
            'amount_paid' => 99999,
            'transaction_date' => $yesterdayUtc,
        ]);
        DB::table('sales')->where('id', $voidSale->id)->update([
            'created_at' => $yesterdayUtc,
            'deleted_at' => $yesterdayUtc,
        ]);

        $demoSale = Sale::create([
            'store_id' => $demoStore->id,
            'cashier_id' => $demoOwner->id,
            'subtotal' => 88888,
            'total_amount' => 88888,
            'payment_method' => 'cash',
            'payment_status' => 'completed',
            'amount_paid' => 88888,
            'transaction_date' => $yesterdayUtc,
        ]);
        DB::table('sales')->where('id', $demoSale->id)->update(['created_at' => $yesterdayUtc]);

        $order = OnlineOrder::create([
            'store_id' => $liveStore->id,
            'customer_name' => 'Sommy',
            'customer_phone' => '08012345678',
            'total_amount' => 4500,
            'payment_method' => 'transfer',
            'payment_status' => 'paid',
            'order_status' => 'pending',
        ]);
        DB::table('online_orders')->where('id', $order->id)->update(['created_at' => $yesterdayUtc]);

        $sub = Subscription::create([
            'user_id' => $owner->id,
            'plan_name' => 'pro',
            'start_date' => $yesterdayUtc,
            'end_date' => $lagosNow->copy()->addDays(5)->utc(),
            'status' => 'active',
            'is_trial' => false,
            'license_key' => 'LIC-TEST-DAILY',
        ]);

        $txn = PaymentTransaction::create([
            'subscription_id' => $sub->id,
            'provider' => 'paystack',
            'provider_reference' => 'REF-DAILY-1',
            'amount' => 25000,
            'currency' => 'NGN',
            'status' => 'success',
        ]);
        DB::table('payment_transactions')->where('id', $txn->id)->update(['created_at' => $yesterdayUtc]);

        SyncHealthDaily::create([
            'store_id' => $liveStore->id,
            'date' => '2026-11-21',
            'pushes' => 10,
            'changes_accepted' => 98,
            'changes_refused' => 2,
            'changes_conflicted' => 1,
        ]);

        SyncFailure::create([
            'store_id' => $liveStore->id,
            'user_id' => $owner->id,
            'table_name' => 'users',
            'record_id' => 'r1',
            'operation' => 'INSERT',
            'reason' => 'email_in_use',
            'created_at' => $yesterdayUtc,
        ]);

        $ticket = Feedback::create([
            'id' => 'fb-1',
            'type' => 'support_ticket',
            'content' => 'Need help',
            'contact_email' => 'grace@example.com',
            'status' => 'pending',
            '_deleted' => false,
        ]);
        DB::table('feedback')->where('id', $ticket->id)->update(['created_at' => $yesterdayUtc]);

        $log = ActivityLog::create([
            'user_id' => $owner->id,
            'action' => 'LOGIN_FAILURE',
            'description' => 'bad pin',
            'status' => 'failed',
        ]);
        DB::table('activity_logs')->where('id', $log->id)->update(['created_at' => $yesterdayUtc]);

        $this->artisan('admin:send-daily-summary')->assertSuccessful();

        Mail::assertSent(SuperAdminAlertMail::class, function (SuperAdminAlertMail $mail) {
            $html = $mail->render();

            return str_contains($mail->alertTitle, '2026-11-21')
                && ! str_contains($html, 'Total Downloads')
                && ! str_contains($html, 'Installer Downloads')
                && str_contains($html, '2 distinct (1 PWA/Web, 1 Desktop)')
                && str_contains($html, '0.0.48 (abcdef1): 1')
                && str_contains($html, 'NGN 15,000.00')
                && ! str_contains($html, '99,999.00')
                && ! str_contains($html, '88,888.00')
                && str_contains($html, 'NGN 25,000.00')
                && str_contains($html, '98%')
                && str_contains($html, 'email_in_use [1]')
                && str_contains($html, 'Top Store: Grace Pharmacy');
        });
    }

    public function test_daily_summary_includes_downloads_only_when_nonzero_and_rejects_bad_date(): void
    {
        config(['dumos.admin_emails' => ['founder@dumosrx.com']]);
        Mail::fake();

        $this->artisan('admin:send-daily-summary', ['--date' => '2026-02-30'])->assertFailed();
        Mail::assertNothingSent();

        $dl = DownloadLog::create(['platform' => 'windows', 'ip_address' => '127.0.0.1']);
        $targetUtc = Carbon::parse('2026-11-20 12:00:00', 'Africa/Lagos')->utc();
        DB::table('download_logs')->where('id', $dl->id)->update(['created_at' => $targetUtc]);

        $this->artisan('admin:send-daily-summary', ['--date' => '2026-11-20'])->assertSuccessful();

        Mail::assertSent(SuperAdminAlertMail::class, function (SuperAdminAlertMail $mail) {
            $html = $mail->render();

            return str_contains($html, 'Installer Downloads')
                && str_contains($html, 'Windows: 1');
        });
    }
}
