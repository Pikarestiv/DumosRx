<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class StorePaymentAccountControllerTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        config(['payment.paystack.secret_key' => 'sk_test_fake']);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Payment',
            'email' => 'payment-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Payment Store',
            'store_slug' => 'payment-store', 'device_id' => 'WEB-PAYMENT',
        ]);

        // Same as other Feature tests hitting authenticated routes
        // (e.g. AccountSecurityTest, CrudFixesTest): actingAs() uses the
        // in-memory model as-is, so DB-default columns like is_active never
        // land on it, and CheckAccountStatus reads that missing attribute
        // as falsy and 403s every request otherwise.
        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
        ]);
    }

    public function test_payment_banks_returns_the_bank_list_for_a_supported_country()
    {
        Http::fake([
            'api.paystack.co/bank*' => Http::response([
                'status' => true,
                'data' => [['name' => 'GTBank', 'code' => '058']],
            ], 200),
        ]);

        $response = $this->actingAs($this->owner)
            ->getJson("/api/v1/stores/{$this->store->id}/payment-banks?country=nigeria");

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'banks');
    }

    public function test_payment_account_resolve_returns_the_resolved_name()
    {
        Http::fake([
            'api.paystack.co/bank/resolve*' => Http::response([
                'status' => true,
                'data' => ['account_number' => '0123456789', 'account_name' => 'JANE M DOE'],
            ], 200),
        ]);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account/resolve", [
                'account_number' => '0123456789',
                'bank_code' => '058',
                'country' => 'nigeria',
            ]);

        $response->assertStatus(200);
        $response->assertJson(['account_name' => 'JANE M DOE']);
    }

    public function test_payment_account_resolve_returns_null_account_name_when_unverifiable()
    {
        Http::fake(['api.paystack.co/bank/resolve*' => Http::response(['status' => false], 422)]);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account/resolve", [
                'account_number' => '0000000000',
                'bank_code' => '058',
                'country' => 'rwanda',
            ]);

        $response->assertStatus(200);
        $response->assertJson(['account_name' => null]);
    }

    public function test_creating_a_payment_account_stores_the_subaccount_code_and_masked_number()
    {
        Http::fake([
            'api.paystack.co/bank/resolve*' => Http::response([
                'status' => true,
                'data' => ['account_number' => '0123456789', 'account_name' => 'JANE M DOE'],
            ], 200),
            'api.paystack.co/subaccount' => Http::response([
                'status' => true,
                'data' => ['subaccount_code' => 'ACCT_new123'],
            ], 200),
        ]);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account", [
                'account_number' => '0123456789',
                'bank_code' => '058',
                'country' => 'nigeria',
            ]);

        $response->assertStatus(200);
        $this->store->refresh();
        $this->assertSame('ACCT_new123', $this->store->paystack_subaccount_code);
        $this->assertSame('nigeria', $this->store->paystack_subaccount_country);
        $this->assertSame('058', $this->store->paystack_bank_code);
        $this->assertSame('6789', $this->store->paystack_account_number_last4);
    }

    public function test_creating_a_payment_account_rejects_an_unresolvable_account_without_confirmation()
    {
        Http::fake([
            'api.paystack.co/bank/resolve*' => Http::response(['status' => false], 422),
            'api.paystack.co/subaccount' => Http::response(['status' => true, 'data' => ['subaccount_code' => 'ACCT_should_not_be_called']], 200),
        ]);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account", [
                'account_number' => '0000000000',
                'bank_code' => '058',
                'country' => 'nigeria',
            ]);

        $response->assertStatus(422);
        Http::assertNotSent(fn ($request) => $request->url() === 'https://api.paystack.co/subaccount');
        $this->store->refresh();
        $this->assertNull($this->store->paystack_subaccount_code);
    }

    public function test_creating_a_payment_account_allows_an_unresolvable_country_with_explicit_confirmation()
    {
        Http::fake([
            // A country resolveAccount() genuinely can't verify (e.g.
            // Rwanda) - null is a normal outcome here, not a rejection.
            'api.paystack.co/bank/resolve*' => Http::response(['status' => false], 422),
            'api.paystack.co/subaccount' => Http::response([
                'status' => true,
                'data' => ['subaccount_code' => 'ACCT_rwanda123'],
            ], 200),
        ]);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account", [
                'account_number' => '1234567',
                'bank_code' => '007',
                'country' => 'rwanda',
                'confirmed_unverifiable' => true,
            ]);

        $response->assertStatus(200);
        $this->store->refresh();
        $this->assertSame('ACCT_rwanda123', $this->store->paystack_subaccount_code);
    }

    public function test_resolve_reports_whether_the_country_can_be_verified_at_all()
    {
        Http::fake([
            'api.paystack.co/bank/resolve*' => Http::response([
                'status' => true,
                'data' => ['account_name' => 'JANE M DOE'],
            ], 200),
        ]);

        $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account/resolve", [
                'account_number' => '0123456789', 'bank_code' => '058', 'country' => 'nigeria',
            ])
            ->assertStatus(200)
            ->assertJson(['verifiable' => true]);

        $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account/resolve", [
                'account_number' => '1234567', 'bank_code' => '007', 'country' => 'rwanda',
            ])
            ->assertStatus(200)
            ->assertJson(['verifiable' => false, 'account_name' => null]);
    }

    public function test_confirmed_unverifiable_is_refused_for_a_country_paystack_can_verify()
    {
        // A typo'd Nigerian account number must not be waved through the
        // escape hatch meant for countries with no resolver at all.
        Http::fake([
            'api.paystack.co/bank/resolve*' => Http::response(['status' => false], 422),
            'api.paystack.co/subaccount' => Http::response(['status' => true, 'data' => ['subaccount_code' => 'ACCT_should_not_be_called']], 200),
        ]);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account", [
                'account_number' => '0000000000',
                'bank_code' => '058',
                'country' => 'nigeria',
                'confirmed_unverifiable' => true,
            ]);

        $response->assertStatus(422);
        Http::assertNothingSent();
        $this->store->refresh();
        $this->assertNull($this->store->paystack_subaccount_code);
    }

    public function test_creating_a_payment_account_is_idempotent_once_already_connected()
    {
        Http::fake(['api.paystack.co/subaccount' => Http::response([
            'status' => true, 'data' => ['subaccount_code' => 'ACCT_should_not_be_called'],
        ], 200)]);

        $this->store->update(['paystack_subaccount_code' => 'ACCT_existing']);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account", [
                'account_number' => '0123456789',
                'bank_code' => '058',
                'country' => 'nigeria',
            ]);

        $response->assertStatus(409);
        Http::assertNothingSent();
        $this->store->refresh();
        $this->assertSame('ACCT_existing', $this->store->paystack_subaccount_code);
    }

    public function test_a_staff_member_cannot_configure_another_owners_store_payment_account()
    {
        $otherOwner = User::create([
            'first_name' => 'Other', 'last_name' => 'Owner',
            'email' => 'other-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $response = $this->actingAs($otherOwner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account", [
                'account_number' => '0123456789', 'bank_code' => '058', 'country' => 'nigeria',
            ]);

        $response->assertStatus(404);
    }
}
