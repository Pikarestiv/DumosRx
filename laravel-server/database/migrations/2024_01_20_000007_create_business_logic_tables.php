<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Subscriptions
        Schema::create('subscriptions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('plan_name'); // e.g. 'Basic', 'Pro'
            $table->dateTime('start_date');
            $table->dateTime('end_date');
            $table->enum('status', ['active', 'expired', 'grace_period', 'cancelled'])->default('active');
            $table->string('license_key')->unique(); // Server-generated key
            $table->timestamps();
        });

        // Licenses (Machine bindings)
        Schema::create('licenses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('subscription_id')->constrained()->cascadeOnDelete();
            $table->string('machine_id'); // Hardware ID from Tauri
            $table->string('machine_name')->nullable();
            $table->dateTime('last_check_in')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            
            $table->unique(['subscription_id', 'machine_id']);
        });

        // Payment Transactions (Stubs)
        Schema::create('payment_transactions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('subscription_id')->nullable()->constrained();
            $table->string('provider'); // paystack, flutterwave, opay
            $table->string('provider_reference')->unique();
            $table->decimal('amount', 12, 2);
            $table->string('currency')->default('NGN');
            $table->enum('status', ['pending', 'success', 'failed', 'abandoned']);
            $table->json('metadata')->nullable(); // Store provider response
            $table->timestamps();
        });

        // Backups
        Schema::create('backups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->text('filename'); // S3 or local path
            $table->bigInteger('size'); // in bytes
            $table->string('hash'); // content hash for validation
            $table->foreignUuid('created_by')->constrained('users');
            $table->dateTime('restored_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('backups');
        Schema::dropIfExists('payment_transactions');
        Schema::dropIfExists('licenses');
        Schema::dropIfExists('subscriptions');
    }
};
