<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use App\Services\Admin\ForeignKeyCascadeEmulator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/** A-278: a SET NULL the emulator replays on a surviving synced row must reach devices like any other server write. */
class ForeignKeyCascadeEmulatorStampTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_nulled_reference_moves_the_surviving_rows_version_and_pull_stamp(): void
    {
        Schema::disableForeignKeyConstraints();
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Nest', 'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $prescriptionId = (string) Str::uuid();
        DB::table('prescriptions')->insert([
            'id' => $prescriptionId, 'user_id' => $owner->id, 'prescription_number' => 'RX-1',
            'prescription_date' => now()->toDateString(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $saleId = (string) Str::uuid();
        $longAgo = now()->subDays(30)->startOfSecond();
        DB::table('sales')->insert([
            'id' => $saleId, 'transaction_number' => 'TXN-1', 'cashier_id' => $owner->id, 'prescription_id' => $prescriptionId,
            'total_amount' => 100, 'amount_paid' => 100, 'payment_method' => 'cash', '_version' => 3,
            'created_at' => $longAgo, 'updated_at' => $longAgo,
        ]);
        Schema::enableForeignKeyConstraints();

        $removed = [];
        app(ForeignKeyCascadeEmulator::class)->cascadeChildren('prescriptions', [$prescriptionId], $removed);

        $sale = DB::table('sales')->where('id', $saleId)->first();
        $this->assertNull($sale->prescription_id);
        $this->assertSame(4, (int) $sale->_version);
        $this->assertGreaterThan($longAgo->toDateTimeString(), (string) $sale->updated_at);
    }
}
