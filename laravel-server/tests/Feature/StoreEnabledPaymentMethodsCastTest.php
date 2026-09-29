<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * stores.enabled_payment_methods reaches the server as a JSON *string* (the
 * client stores the column as SQLite TEXT and writes it with
 * JSON.stringify), and the sync push hands that string straight to
 * Model::forceFill(). An 'array' cast json_encode()s a string argument, so
 * the column ends up double-encoded and decodes back to a PHP string rather
 * than an array - which is what crashed the admin store-detail page with
 * "enabled_payment_methods.join is not a function".
 */
class StoreEnabledPaymentMethodsCastTest extends TestCase
{
    use RefreshDatabase;

    private function makeStore(): Store
    {
        $owner = User::create([
            'first_name' => 'Pay',
            'last_name' => 'Methods',
            'email' => 'pay.methods@example.test',
            'password' => bcrypt('secret-password'),
            'role' => 'store_owner',
        ]);

        return Store::create([
            'name' => 'Payment Methods Store',
            'user_id' => $owner->id,
            'device_id' => 'DRX-TESTDEVICE',
        ]);
    }

    public function test_a_json_string_written_by_the_sync_push_is_not_double_encoded(): void
    {
        $store = $this->makeStore();

        $store->forceFill(['enabled_payment_methods' => '["cash","card"]'])->save();

        $this->assertSame(['cash', 'card'], $store->fresh()->enabled_payment_methods);
    }

    public function test_an_already_double_encoded_row_still_reads_back_as_an_array(): void
    {
        $store = $this->makeStore();

        DB::table('stores')
            ->where('id', $store->id)
            ->update(['enabled_payment_methods' => json_encode('["cash","transfer"]')]);

        $this->assertSame(['cash', 'transfer'], $store->fresh()->enabled_payment_methods);
    }

    public function test_a_bare_non_json_string_reads_back_as_an_empty_array_instead_of_throwing(): void
    {
        $store = $this->makeStore();

        DB::table('stores')
            ->where('id', $store->id)
            ->update(['enabled_payment_methods' => 'cash,card']);

        $this->assertSame([], $store->fresh()->enabled_payment_methods);
    }

    public function test_a_real_array_round_trips_unchanged(): void
    {
        $store = $this->makeStore();

        $store->forceFill(['enabled_payment_methods' => ['cash', 'credit']])->save();

        $this->assertSame(['cash', 'credit'], $store->fresh()->enabled_payment_methods);
    }

    public function test_a_json_object_is_not_passed_off_as_a_list_of_methods(): void
    {
        $store = $this->makeStore();

        DB::table('stores')
            ->where('id', $store->id)
            ->update(['enabled_payment_methods' => '{"cash":true}']);

        $this->assertSame([], $store->fresh()->enabled_payment_methods);
    }
}
