<?php

namespace Tests\Feature;

use App\Models\Feedback;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * `feedback.content` is a MySQL TEXT column — 65,535 BYTES. Without a `max`
 * the oversized submission reached the insert and MySQL strict mode turned it
 * into a 500, so the device report was lost on exactly the till that had the
 * most to say. Rationale in laravel-server/AGENTS.md, "Remote device report".
 */
class SupportMessageLengthTest extends TestCase
{
    use RefreshDatabase;

    private function submit(string $message)
    {
        return $this->withoutMiddleware()->postJson('/api/v1/support', [
            'name' => 'Till 7 (device report)',
            'email' => 'ops@dumosrx.com',
            'subject' => 'Device report - Agidi',
            'message' => $message,
        ]);
    }

    public function test_an_oversized_report_is_a_clean_422_not_a_500(): void
    {
        $response = $this->submit(str_repeat('x', 60_001));

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('message');
        $this->assertSame(0, Feedback::count());
    }

    public function test_a_report_at_the_cap_is_still_accepted(): void
    {
        $this->submit(str_repeat('x', 60_000))->assertStatus(200);

        $this->assertSame(1, Feedback::count());
    }

    public function test_the_ordinary_public_support_form_still_works(): void
    {
        $this->submit('My printer will not connect.')->assertStatus(200);

        $this->assertStringContainsString(
            'My printer will not connect.',
            (string) Feedback::first()->content,
        );
    }
}
