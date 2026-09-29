<?php

namespace Tests\Feature\Admin;

use App\Mail\AdminCustomMail;
use App\Models\Broadcast;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Coverage for the "Also send by email" broadcast option: recipient
 * resolution (store owners with a real email only) and the fires-once-at-
 * creation rule.
 */
class BroadcastEmailTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    protected function makeStoreOwner(string $email): User
    {
        $owner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner',
            'email' => $email,
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        Store::create([
            'user_id' => $owner->id,
            'name' => 'Owner Store',
            'store_slug' => 'owner-store-' . Str::random(8),
            'device_id' => 'WEB-' . Str::random(8),
        ]);

        return $owner;
    }

    protected function makeStaff(User $owner, string $username): User
    {
        return User::create([
            'first_name' => 'Staff', 'last_name' => 'Member',
            'email' => $username . '@local.dumosrx.com',
            'username' => $username,
            'store_id' => $owner->store->id,
            'password' => bcrypt('password'),
            'role' => 'cashier',
        ]);
    }

    protected function createBroadcast(array $overrides = [])
    {
        return $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/announcements', array_merge([
            'title' => 'Platform Maintenance',
            'message' => 'We will be down tonight.',
            'type' => 'warning',
            'target_type' => 'all',
        ], $overrides));
    }

    public function test_send_email_true_mails_every_store_owner_with_a_real_email()
    {
        Mail::fake();

        $ownerOne = $this->makeStoreOwner('owner-one@pharmacy.com');
        $ownerTwo = $this->makeStoreOwner('owner-two@pharmacy.com');
        $this->makeStaff($ownerOne, 'cashier1');

        $this->createBroadcast(['send_email' => true])->assertStatus(200);

        Mail::assertQueued(AdminCustomMail::class, 2);
        foreach ([$ownerOne, $ownerTwo] as $owner) {
            Mail::assertQueued(AdminCustomMail::class, fn ($mail) => $mail->hasTo($owner->email)
                && $mail->subjectLine === 'Platform Maintenance');
        }
    }

    public function test_store_owner_with_a_local_placeholder_email_is_skipped()
    {
        Mail::fake();

        $this->makeStoreOwner('placeholder@local.dumosrx.com');

        $this->createBroadcast(['send_email' => true])->assertStatus(200);

        Mail::assertNothingQueued();
    }

    public function test_staff_and_platform_users_never_receive_a_broadcast_email()
    {
        Mail::fake();

        $owner = $this->makeStoreOwner('owner@pharmacy.com');
        $this->makeStaff($owner, 'cashier1');

        $this->createBroadcast(['send_email' => true])->assertStatus(200);

        Mail::assertQueued(AdminCustomMail::class, 1);
        Mail::assertNotQueued(AdminCustomMail::class, fn ($mail) => $mail->hasTo('cashier1@local.dumosrx.com')
            || $mail->hasTo($this->superAdmin->email));
    }

    public function test_send_email_omitted_queues_nothing()
    {
        Mail::fake();

        $this->makeStoreOwner('owner@pharmacy.com');

        $this->createBroadcast()->assertStatus(200);

        Mail::assertNothingQueued();
        $this->assertFalse(Broadcast::first()->send_email);
    }

    public function test_send_email_false_queues_nothing()
    {
        Mail::fake();

        $this->makeStoreOwner('owner@pharmacy.com');

        $this->createBroadcast(['send_email' => false])->assertStatus(200);

        Mail::assertNothingQueued();
    }

    public function test_specific_target_naming_a_staff_user_sends_nothing_to_them()
    {
        Mail::fake();

        $owner = $this->makeStoreOwner('owner@pharmacy.com');
        $staff = $this->makeStaff($owner, 'cashier1');

        $this->createBroadcast([
            'target_type' => 'specific',
            'user_ids' => [$staff->id],
            'send_email' => true,
        ])->assertStatus(200);

        Mail::assertNothingQueued();
    }

    public function test_specific_target_mails_only_the_named_store_owners()
    {
        Mail::fake();

        $named = $this->makeStoreOwner('named@pharmacy.com');
        $this->makeStoreOwner('unnamed@pharmacy.com');

        $this->createBroadcast([
            'target_type' => 'specific',
            'user_ids' => [$named->id],
            'send_email' => true,
        ])->assertStatus(200);

        Mail::assertQueued(AdminCustomMail::class, 1);
        Mail::assertQueued(AdminCustomMail::class, fn ($mail) => $mail->hasTo('named@pharmacy.com'));
    }

    public function test_updating_a_broadcast_never_requeues_mail()
    {
        Mail::fake();

        $this->makeStoreOwner('owner@pharmacy.com');

        $created = $this->createBroadcast(['send_email' => true])->assertStatus(200);
        Mail::assertQueued(AdminCustomMail::class, 1);

        $id = $created->json('data.id');
        $this->actingAs($this->superAdmin)->putJson("/api/v1/admin/announcements/{$id}", [
            'message' => 'Revised wording.',
            'send_email' => true,
        ])->assertStatus(200);

        Mail::assertQueued(AdminCustomMail::class, 1);
    }

    public function test_toggling_send_email_on_during_an_update_does_not_send()
    {
        Mail::fake();

        $this->makeStoreOwner('owner@pharmacy.com');

        $created = $this->createBroadcast(['send_email' => false])->assertStatus(200);
        $id = $created->json('data.id');

        $this->actingAs($this->superAdmin)->putJson("/api/v1/admin/announcements/{$id}", [
            'send_email' => true,
        ])->assertStatus(200);

        Mail::assertNothingQueued();
    }

    public function test_an_already_expired_broadcast_sends_nothing()
    {
        Mail::fake();

        $this->makeStoreOwner('owner@pharmacy.com');

        $this->createBroadcast([
            'send_email' => true,
            'expires_at' => now()->subDay()->toDateTimeString(),
        ])->assertStatus(200);

        Mail::assertNothingQueued();
    }

    public function test_an_inactive_broadcast_sends_nothing()
    {
        Mail::fake();

        $this->makeStoreOwner('owner@pharmacy.com');

        $this->createBroadcast([
            'send_email' => true,
            'is_active' => false,
        ])->assertStatus(200);

        Mail::assertNothingQueued();
    }
}
