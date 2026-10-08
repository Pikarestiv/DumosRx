<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AdminUserDeletionGuardsTest extends TestCase
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

    private function makeUser(string $role): User
    {
        return User::create([
            'first_name' => 'Target',
            'last_name' => uniqid(),
            'email' => 'target-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    #[Test]
    public function it_refuses_to_delete_the_acting_admins_own_account(): void
    {
        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/v1/admin/users/{$this->superAdmin->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('users', [
            'id' => $this->superAdmin->id,
            'deleted_at' => null,
        ]);
    }

    #[Test]
    public function it_refuses_to_delete_the_acting_admins_own_account_even_as_the_last_super_admin(): void
    {
        $this->assertSame(1, User::where('role', 'super_admin')->count());

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/v1/admin/users/{$this->superAdmin->id}")
            ->assertStatus(422);

        $this->assertSame(1, User::where('role', 'super_admin')->count());
    }

    #[Test]
    public function it_refuses_to_delete_another_platform_account(): void
    {
        foreach (['super_admin', 'platform_admin', 'agent'] as $role) {
            $target = $this->makeUser($role);

            $this->actingAs($this->superAdmin)
                ->deleteJson("/api/v1/admin/users/{$target->id}")
                ->assertStatus(422);

            $this->assertDatabaseHas('users', [
                'id' => $target->id,
                'deleted_at' => null,
            ]);
        }
    }

    #[Test]
    public function it_still_deletes_an_ordinary_store_owner(): void
    {
        $owner = $this->makeUser('store_owner');
        $store = Store::create([
            'name' => 'Target Pharmacy',
            'user_id' => $owner->id,
            'device_id' => 'TEST-'.uniqid(),
        ]);

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/v1/admin/users/{$owner->id}")
            ->assertOk();

        $this->assertSoftDeleted('users', ['id' => $owner->id]);
        $this->assertSoftDeleted('stores', ['id' => $store->id]);
    }

    #[Test]
    public function it_still_deletes_an_ordinary_staff_account(): void
    {
        $owner = $this->makeUser('store_owner');
        $store = Store::create([
            'name' => 'Target Pharmacy',
            'user_id' => $owner->id,
            'device_id' => 'TEST-'.uniqid(),
        ]);
        $staff = $this->makeUser('admin');
        $staff->store_id = $store->id;
        $staff->save();

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/v1/admin/users/{$staff->id}")
            ->assertOk();

        $this->assertSoftDeleted('users', ['id' => $staff->id]);
        $this->assertDatabaseHas('stores', ['id' => $store->id, 'deleted_at' => null]);
    }

    #[Test]
    public function it_records_the_refusal_without_writing_a_deletion_audit_entry(): void
    {
        $before = \App\Models\ActivityLog::where('action', 'USER_DELETION')->count();

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/v1/admin/users/{$this->superAdmin->id}")
            ->assertStatus(422);

        $this->assertSame(
            $before,
            \App\Models\ActivityLog::where('action', 'USER_DELETION')->count(),
        );
    }
}
