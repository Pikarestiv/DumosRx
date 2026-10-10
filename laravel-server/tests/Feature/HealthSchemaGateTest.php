<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class HealthSchemaGateTest extends TestCase
{
    use RefreshDatabase;

    private function workflow(): string
    {
        return file_get_contents(base_path('../.github/workflows/deploy-backend.yml'));
    }

    public function test_health_reports_the_schema_as_current_when_nothing_is_pending(): void
    {
        $this->getJson('/api/v1/health?schema=1')
            ->assertOk()
            ->assertJson(['status' => 'ok', 'schema_current' => true]);
    }

    public function test_health_reports_the_schema_as_not_current_when_a_migration_has_not_run(): void
    {
        DB::table('migrations')->orderByDesc('id')->limit(1)->delete();

        $this->getJson('/api/v1/health?schema=1')
            ->assertOk()
            ->assertJson(['status' => 'ok', 'schema_current' => false]);
    }

    /**
     * "Don't know" must gate the deploy exactly like "behind": the whole point
     * of the field is that nobody discovers a pending migration via a 500.
     */
    public function test_an_unreadable_migrations_table_is_not_reported_as_current(): void
    {
        Schema::drop('migrations');

        $this->getJson('/api/v1/health?schema=1')
            ->assertOk()
            ->assertJson(['schema_current' => false]);
    }

    public function test_health_does_not_disclose_which_migrations_are_pending(): void
    {
        DB::table('migrations')->orderByDesc('id')->limit(1)->delete();

        $body = $this->getJson('/api/v1/health?schema=1')->getContent();

        $this->assertStringNotContainsString('pending', $body);
        $this->assertStringNotContainsString('_create_', $body);
    }

    /**
     * Every till hits /health to anchor its clock, so the comparison must not
     * be on that path by default.
     */
    public function test_the_schema_comparison_is_opt_in(): void
    {
        $this->getJson('/api/v1/health')
            ->assertOk()
            ->assertJson(['status' => 'ok'])
            ->assertJsonMissingPath('schema_current');
    }

    public function test_the_deploy_workflow_fails_when_the_deployed_schema_is_not_current(): void
    {
        $workflow = $this->workflow();

        $this->assertStringContainsString('schema_current', $workflow);
        $this->assertStringContainsString('/health', $workflow);
        $this->assertStringContainsString('?schema=1', $workflow);
        $this->assertStringContainsString('::error::', $workflow);
    }

    /**
     * A-210's decision, pinned: the deploy detects a pending migration and
     * refuses, it does not apply one. See docs/FIXED_BUGS.md A-210.
     */
    public function test_the_deploy_workflow_does_not_run_migrations_itself(): void
    {
        $this->assertStringNotContainsString('artisan migrate', $this->workflow());
    }
}
