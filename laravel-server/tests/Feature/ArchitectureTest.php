<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ArchitectureTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A basic test to ensure core tables exist after migration.
     */
    public function test_core_tables_exist(): void
    {
        $this->assertTrue(Schema::hasTable('users'));
        $this->assertTrue(Schema::hasTable('roles'));
        $this->assertTrue(Schema::hasTable('permissions'));
        $this->assertTrue(Schema::hasTable('activity_logs'));
        $this->assertTrue(Schema::hasTable('personal_access_tokens'));
    }

    /**
     * Test inventory tables exist.
     */
    public function test_inventory_tables_exist(): void
    {
        $this->assertTrue(Schema::hasTable('categories'));
        $this->assertTrue(Schema::hasTable('suppliers'));
        $this->assertTrue(Schema::hasTable('medicines'));
        $this->assertTrue(Schema::hasTable('inventory'));
    }

    /**
     * Test sales tables exist.
     */
    public function test_sales_tables_exist(): void
    {
        $this->assertTrue(Schema::hasTable('customers'));
        $this->assertTrue(Schema::hasTable('sales'));
        $this->assertTrue(Schema::hasTable('sale_items'));
        $this->assertTrue(Schema::hasTable('prescriptions'));
    }

     /**
     * Test business logic tables exist.
     */
    public function test_business_tables_exist(): void
    {
        $this->assertTrue(Schema::hasTable('subscriptions'));
        $this->assertTrue(Schema::hasTable('licenses'));
        $this->assertTrue(Schema::hasTable('backups'));
    }
}
