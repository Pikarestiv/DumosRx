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
        // Alter users table
        Schema::table('users', function (Blueprint $table) {
            $table->uuid('referred_by_id')->nullable()->after('id');
            $table->string('referral_code')->nullable()->unique()->after('remember_token');
            $table->decimal('referral_credits', 12, 2)->default(0.00)->after('referral_code');

            $table->foreign('referred_by_id')
                ->references('id')
                ->on('users')
                ->onDelete('set null');
        });

        // Create referral credit transactions table
        Schema::create('referral_credit_transactions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->uuid('referred_user_id')->nullable();
            $table->enum('type', ['earned', 'spent', 'admin_adjustment']);
            $table->decimal('amount', 12, 2);
            $table->string('description');
            $table->timestamps();

            $table->foreign('user_id')
                ->references('id')
                ->on('users')
                ->onDelete('cascade');

            $table->foreign('referred_user_id')
                ->references('id')
                ->on('users')
                ->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('referral_credit_transactions');

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['referred_by_id']);
            $table->dropColumn(['referred_by_id', 'referral_code', 'referral_credits']);
        });
    }
};
