<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use App\Models\UserDevice;
use App\Services\Admin\Concerns\ResolvesDeviceLabels;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A sniffed label comes from the user agent, which is a property of the
 * device and not of any store. See laravel-server/AGENTS.md, "Device labels".
 */
class ResolvesDeviceLabelsTest extends TestCase
{
    use RefreshDatabase;

    private object $resolver;

    private User $owner;

    private Store $home;

    private Store $other;

    protected function setUp(): void
    {
        parent::setUp();

        $this->resolver = new class
        {
            use ResolvesDeviceLabels {
                deviceLabel as public;
            }
        };

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);

        $this->home = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Home Branch',
            'device_id' => 'DRX-LAPTOP', 'currency' => 'NGN',
        ]);

        $this->other = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Second Branch',
            'device_id' => 'DRX-SECOND-TILL', 'currency' => 'NGN',
        ]);

        UserDevice::create([
            'user_id' => $this->owner->id,
            'store_id' => $this->home->id,
            'device_id' => 'DRX-LAPTOP',
            'device_label' => 'Chrome on Mac',
        ]);
    }

    public function test_a_sniffed_label_resolves_in_a_store_other_than_the_devices_home_store()
    {
        $this->assertSame(
            'Chrome on Mac',
            $this->resolver->deviceLabel($this->other->id, 'DRX-LAPTOP'),
        );
    }

    public function test_a_sniffed_label_still_resolves_in_the_devices_own_store()
    {
        $this->assertSame(
            'Chrome on Mac',
            $this->resolver->deviceLabel($this->home->id, 'DRX-LAPTOP'),
        );
    }

    public function test_a_nickname_stays_scoped_to_the_store_it_was_set_in()
    {
        DB::table('device_nicknames')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'store_id' => $this->home->id,
            'device_id' => 'DRX-LAPTOP',
            'nickname' => 'Front Till',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertSame('Front Till', $this->resolver->deviceLabel($this->home->id, 'DRX-LAPTOP'));
        $this->assertSame('Chrome on Mac', $this->resolver->deviceLabel($this->other->id, 'DRX-LAPTOP'));
    }
}
