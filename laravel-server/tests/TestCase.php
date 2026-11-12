<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        if (app()->environment('production') || env('APP_ENV') === 'production') {
            throw new \RuntimeException('SAFETY VIOLATION: Automated tests cannot execute in a production environment.');
        }

        if (config('database.default') === 'sqlite' && config('database.connections.sqlite.database') !== ':memory:') {
            throw new \RuntimeException('SAFETY VIOLATION: SQLite database must be :memory: during tests.');
        }
    }
}
