<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The owner's Sentry quota is shared by every package, so a developer's
 * machine and the test suite must not spend it. `.env` carries a real DSN
 * locally, so the gate has to live in config, not in the env file.
 */
class SentryEnvironmentGatingTest extends TestCase
{
    public function test_no_dsn_is_resolved_outside_a_deployed_environment(): void
    {
        $this->assertNull(config('sentry.dsn'));
    }

    public function test_the_environment_tag_falls_back_to_the_app_environment(): void
    {
        $this->assertSame(config('app.env'), config('sentry.environment'));
    }
}
