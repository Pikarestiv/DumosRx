<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Deliberately separate from the existing referral_code/referred_by_id/
// referral_credits columns, which already power a live customer-to-customer
// referral program (store owners referring other store owners for account
// credit). Platform staff (super_admin/platform_admin/agent) onboarding new
// pharmacies on the company's behalf is a different relationship — sharing
// the customer columns would risk agents surfacing in customer-facing
// referral UI or becoming eligible for credit redemption.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('platform_referral_code')->nullable()->unique()->after('referral_credits');
            $table->uuid('registered_by_id')->nullable()->after('platform_referral_code');

            $table->foreign('registered_by_id')
                ->references('id')->on('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['registered_by_id']);
            $table->dropColumn(['platform_referral_code', 'registered_by_id']);
        });
    }
};
