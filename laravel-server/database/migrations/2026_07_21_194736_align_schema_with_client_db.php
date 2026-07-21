<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Missing Tables
        if (!Schema::hasTable('audit_logs')) {
            Schema::create('audit_logs', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('user_id')->nullable();
                $table->string('action')->nullable();
                $table->string('table_name')->nullable();
                $table->string('record_id')->nullable();
                $table->text('details')->nullable();
                $table->timestamps();
                $table->integer('_version')->default(1);
                $table->boolean('_synced')->default(0);
                $table->timestamp('_synced_at')->nullable();
                $table->boolean('_deleted')->default(0);
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('stock_audits')) {
            Schema::create('stock_audits', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('product_id');
                $table->integer('expected_quantity');
                $table->integer('actual_quantity');
                $table->integer('difference');
                $table->text('notes')->nullable();
                $table->uuid('user_id');
                $table->string('status')->default('pending');
                $table->timestamp('reconciled_at')->nullable();
                $table->timestamps();
                $table->integer('_version')->default(1);
                $table->boolean('_synced')->default(0);
                $table->timestamp('_synced_at')->nullable();
                $table->boolean('_deleted')->default(0);
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('held_transactions')) {
            Schema::create('held_transactions', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('customer_id')->nullable();
                $table->string('customer_name')->nullable();
                $table->json('items_json');
                $table->decimal('total_amount', 12, 2);
                $table->text('notes')->nullable();
                $table->timestamps();
                $table->integer('_version')->default(1);
                $table->boolean('_synced')->default(0);
                $table->timestamp('_synced_at')->nullable();
                $table->boolean('_deleted')->default(0);
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('loyalty_transactions')) {
            Schema::create('loyalty_transactions', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('customer_id');
                $table->decimal('points', 10, 2);
                $table->string('type');
                $table->string('transaction_id')->nullable();
                $table->timestamps();
                $table->integer('_version')->default(1);
                $table->boolean('_synced')->default(0);
                $table->timestamp('_synced_at')->nullable();
                $table->boolean('_deleted')->default(0);
                $table->softDeletes();
            });
        }

        // Alter Products
        Schema::table('products', function (Blueprint $table) {
            if (!Schema::hasColumn('products', 'base_unit')) $table->string('base_unit')->default('Unit');
            if (!Schema::hasColumn('products', 'bulk_unit')) $table->string('bulk_unit')->nullable();
            if (!Schema::hasColumn('products', 'units_per_bulk')) $table->integer('units_per_bulk')->default(1);
            if (!Schema::hasColumn('products', '_version')) $table->integer('_version')->default(1);
        });

        // Alter Stock Batches
        Schema::table('stock_batches', function (Blueprint $table) {
            if (!Schema::hasColumn('stock_batches', 'is_active')) $table->boolean('is_active')->default(1);
            if (!Schema::hasColumn('stock_batches', '_version')) $table->integer('_version')->default(1);
            if (!Schema::hasColumn('stock_batches', 'deleted_at')) $table->softDeletes();
        });

        // Alter Categories
        Schema::table('categories', function (Blueprint $table) {
            if (!Schema::hasColumn('categories', '_version')) $table->integer('_version')->default(1);
            if (!Schema::hasColumn('categories', 'deleted_at')) $table->softDeletes();
        });

        // Alter Customers
        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'credit_limit')) $table->decimal('credit_limit', 12, 2)->default(0);
            if (!Schema::hasColumn('customers', 'outstanding_balance')) $table->decimal('outstanding_balance', 12, 2)->default(0);
            if (!Schema::hasColumn('customers', 'notes')) $table->text('notes')->nullable();
            if (!Schema::hasColumn('customers', 'is_active')) $table->boolean('is_active')->default(1);
            if (!Schema::hasColumn('customers', '_version')) $table->integer('_version')->default(1);
        });

        // Alter Sales
        Schema::table('sales', function (Blueprint $table) {
            if (!Schema::hasColumn('sales', '_version')) $table->integer('_version')->default(1);
        });

        // Alter Sale Items
        Schema::table('sale_items', function (Blueprint $table) {
            if (!Schema::hasColumn('sale_items', '_version')) $table->integer('_version')->default(1);
        });

        // Alter Prescriptions
        Schema::table('prescriptions', function (Blueprint $table) {
            if (!Schema::hasColumn('prescriptions', 'patient_name')) $table->string('patient_name')->nullable();
            if (!Schema::hasColumn('prescriptions', 'patient_phone')) $table->string('patient_phone')->nullable();
            if (!Schema::hasColumn('prescriptions', 'patient_age')) $table->integer('patient_age')->nullable();
            if (!Schema::hasColumn('prescriptions', 'doctor_license')) $table->string('doctor_license')->nullable();
            if (!Schema::hasColumn('prescriptions', 'priority')) $table->string('priority')->default('normal');
            if (!Schema::hasColumn('prescriptions', 'insurance')) $table->string('insurance')->nullable();
            if (!Schema::hasColumn('prescriptions', 'total_cost')) $table->decimal('total_cost', 12, 2)->default(0);
            if (!Schema::hasColumn('prescriptions', 'issued_at')) $table->timestamp('issued_at')->nullable();
            if (!Schema::hasColumn('prescriptions', '_version')) $table->integer('_version')->default(1);
            if (!Schema::hasColumn('prescriptions', '_synced_at')) $table->timestamp('_synced_at')->nullable();
            if (!Schema::hasColumn('prescriptions', 'deleted_at')) $table->softDeletes();
        });

        // Alter Prescription Items
        Schema::table('prescription_items', function (Blueprint $table) {
            if (!Schema::hasColumn('prescription_items', '_version')) $table->integer('_version')->default(1);
            if (!Schema::hasColumn('prescription_items', '_synced_at')) $table->timestamp('_synced_at')->nullable();
            if (!Schema::hasColumn('prescription_items', 'deleted_at')) $table->softDeletes();
        });

        // Alter Expenses
        Schema::table('expenses', function (Blueprint $table) {
            if (!Schema::hasColumn('expenses', 'deleted_at')) $table->softDeletes();
        });

        // Alter Users
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', '_version')) $table->integer('_version')->default(1);
        });

        // Alter Returns
        Schema::table('returns', function (Blueprint $table) {
            if (!Schema::hasColumn('returns', 'deleted_at')) $table->softDeletes();
        });

        // Alter Purchase Orders
        Schema::table('purchase_orders', function (Blueprint $table) {
            if (!Schema::hasColumn('purchase_orders', 'received_at')) $table->timestamp('received_at')->nullable();
            if (!Schema::hasColumn('purchase_orders', '_version')) $table->integer('_version')->default(1);
            if (!Schema::hasColumn('purchase_orders', 'deleted_at')) $table->softDeletes();
        });

        // Alter Purchase Order Items
        Schema::table('purchase_order_items', function (Blueprint $table) {
            if (!Schema::hasColumn('purchase_order_items', 'po_id')) $table->uuid('po_id')->nullable();
            if (!Schema::hasColumn('purchase_order_items', 'bulk_quantity')) $table->integer('bulk_quantity')->default(0);
            if (!Schema::hasColumn('purchase_order_items', 'units_per_bulk')) $table->integer('units_per_bulk')->default(1);
            if (!Schema::hasColumn('purchase_order_items', 'subtotal')) $table->decimal('subtotal', 12, 2)->default(0);
            if (!Schema::hasColumn('purchase_order_items', '_version')) $table->integer('_version')->default(1);
            if (!Schema::hasColumn('purchase_order_items', 'deleted_at')) $table->softDeletes();
        });

        // Alter Suppliers
        Schema::table('suppliers', function (Blueprint $table) {
            if (!Schema::hasColumn('suppliers', '_version')) $table->integer('_version')->default(1);
        });

        // Alter Stores
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'logo_url')) $table->string('logo_url')->nullable();
            if (!Schema::hasColumn('stores', 'is_initialized')) $table->boolean('is_initialized')->default(0);
            if (!Schema::hasColumn('stores', 'theme')) $table->string('theme')->default('default');
            if (!Schema::hasColumn('stores', 'license_token')) $table->string('license_token')->nullable();
            if (!Schema::hasColumn('stores', 'subscription_tier')) $table->string('subscription_tier')->default('free');
            if (!Schema::hasColumn('stores', 'last_monotonic_time')) $table->string('last_monotonic_time')->nullable();
            if (!Schema::hasColumn('stores', 'enabled_payment_methods')) $table->json('enabled_payment_methods')->nullable();
            if (!Schema::hasColumn('stores', 'deleted_at')) $table->softDeletes();
        });

        // Alter Feedback
        Schema::table('feedback', function (Blueprint $table) {
            if (!Schema::hasColumn('feedback', '_version')) $table->integer('_version')->default(1);
            if (!Schema::hasColumn('feedback', 'deleted_at')) $table->softDeletes();
        });

        // Alter Stock Movements
        Schema::table('stock_movements', function (Blueprint $table) {
            if (!Schema::hasColumn('stock_movements', '_version')) $table->integer('_version')->default(1);
            if (!Schema::hasColumn('stock_movements', 'deleted_at')) $table->softDeletes();
        });

        // Alter Payment Accounts
        Schema::table('payment_accounts', function (Blueprint $table) {
            if (!Schema::hasColumn('payment_accounts', 'deleted_at')) $table->softDeletes();
        });

        // Alter Requested Products
        Schema::table('requested_products', function (Blueprint $table) {
            if (!Schema::hasColumn('requested_products', 'deleted_at')) $table->softDeletes();
        });

        // Alter Supplier Payments
        Schema::table('supplier_payments', function (Blueprint $table) {
            if (!Schema::hasColumn('supplier_payments', 'deleted_at')) $table->softDeletes();
        });
    }

    public function down(): void
    {
    }
};
