<?php

namespace Tests\Feature;

use App\Mail\FunnelSetupReminderEmail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class SendFunnelRemindersCommandTest extends TestCase
{
    use RefreshDatabase;

    private static ?string $passwordHash = null;

    private function userAtLevel(int $level, ?string $lastSentAt): User
    {
        $user = User::create([
            'first_name' => 'Funnel', 'last_name' => 'User',
            'email' => 'funnel-'.uniqid().'@dumosrx.test', 'password' => self::$passwordHash ??= bcrypt('password'),
            'role' => 'store_owner', 'is_active' => true,
        ]);

        DB::table('users')->where('id', $user->id)->update([
            'created_at' => now()->subDays(30),
            'setup_reminder_level' => $level,
            'setup_reminder_last_sent_at' => $lastSentAt,
        ]);

        return $user;
    }

    private function levelOf(User $user): int
    {
        return (int) DB::table('users')->where('id', $user->id)->value('setup_reminder_level');
    }

    public function test_second_reminder_is_sent_once_72_hours_have_passed(): void
    {
        Mail::fake();
        $user = $this->userAtLevel(1, now()->subHours(73)->toDateTimeString());

        $this->artisan('funnel:remind')->assertSuccessful();

        Mail::assertSent(FunnelSetupReminderEmail::class, 1);
        $this->assertSame(2, $this->levelOf($user));
    }

    public function test_second_reminder_waits_until_72_hours_have_passed(): void
    {
        Mail::fake();
        $user = $this->userAtLevel(1, now()->subHours(71)->toDateTimeString());

        $this->artisan('funnel:remind')->assertSuccessful();

        Mail::assertNothingSent();
        $this->assertSame(1, $this->levelOf($user));
    }

    public function test_third_reminder_respects_the_seven_day_gap(): void
    {
        Mail::fake();
        $due = $this->userAtLevel(2, now()->subDays(8)->toDateTimeString());
        $notDue = $this->userAtLevel(2, now()->subDays(6)->toDateTimeString());

        $this->artisan('funnel:remind')->assertSuccessful();

        Mail::assertSent(FunnelSetupReminderEmail::class, 1);
        $this->assertSame(3, $this->levelOf($due));
        $this->assertSame(2, $this->levelOf($notDue));
    }

    public function test_a_level_one_user_does_not_block_first_reminders_for_others(): void
    {
        Mail::fake();
        $this->userAtLevel(1, now()->subHours(1)->toDateTimeString());
        $fresh = $this->userAtLevel(0, null);

        $this->artisan('funnel:remind')->assertSuccessful();

        Mail::assertSent(FunnelSetupReminderEmail::class, 1);
        $this->assertSame(1, $this->levelOf($fresh));
    }

    public function test_one_run_sends_at_most_one_hundred_reminders_and_the_rest_wait_for_the_next(): void
    {
        Mail::fake();
        $lastSentAt = now()->subHours(73)->toDateTimeString();
        $users = collect(range(1, 102))->map(fn () => $this->userAtLevel(1, $lastSentAt));

        $this->artisan('funnel:remind')->assertSuccessful();
        Mail::assertSent(FunnelSetupReminderEmail::class, 100);

        $this->artisan('funnel:remind')->assertSuccessful();
        Mail::assertSent(FunnelSetupReminderEmail::class, 102);
        $this->assertSame(0, $users->filter(fn (User $user) => $this->levelOf($user) !== 2)->count());
    }
}
