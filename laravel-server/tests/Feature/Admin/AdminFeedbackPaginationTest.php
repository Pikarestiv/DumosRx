<?php

namespace Tests\Feature\Admin;

use App\Models\Feedback;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Coverage for the superadmin Communications > Feedback tab, which never
 * showed more than the first 50 rows: FeedbackController::index always
 * returned Laravel's raw paginator response, but the frontend
 * (useAdminFeedback / FeedbackTab) typed and rendered it as a flat array
 * with no page param and no pagination controls, so page 1 was the only
 * page ever fetched. Fixed by reshaping the backend response into the same
 * {data, meta: {current_page, last_page, total}} envelope every other admin
 * list endpoint already uses, and wiring page state + Prev/Next through the
 * frontend hook and component.
 */
class AdminFeedbackPaginationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function superAdmin(): User
    {
        return User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
    }

    public function test_second_page_returns_different_rows_with_pagination_meta(): void
    {
        for ($i = 0; $i < 55; $i++) {
            Feedback::create([
                'id' => (string) Str::uuid(),
                'type' => 'bug',
                'content' => "Feedback #$i",
                'status' => 'pending',
                '_deleted' => false,
                'created_at' => now()->subMinutes(55 - $i),
            ]);
        }

        $admin = $this->superAdmin();

        $page1 = $this->actingAs($admin)->getJson('/api/v1/admin/feedback?page=1');
        $page1->assertOk();
        $page1->assertJsonCount(50, 'data');
        $page1->assertJsonPath('meta.current_page', 1);
        $page1->assertJsonPath('meta.last_page', 2);
        $page1->assertJsonPath('meta.total', 55);

        $page2 = $this->actingAs($admin)->getJson('/api/v1/admin/feedback?page=2');
        $page2->assertOk();
        $page2->assertJsonCount(5, 'data');
        $page2->assertJsonPath('meta.current_page', 2);

        $page1Ids = collect($page1->json('data'))->pluck('id');
        $page2Ids = collect($page2->json('data'))->pluck('id');
        $this->assertEmpty($page1Ids->intersect($page2Ids));
    }
}
