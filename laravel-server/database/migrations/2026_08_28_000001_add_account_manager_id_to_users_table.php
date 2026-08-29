<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Separate from registered_by_id on purpose: registered_by_id drives
// referral/attribution reporting (see the platform referral columns
// migration) and must never be rewritten just because a superadmin
// reassigns who a store's "contact specialist" is.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->uuid('account_manager_id')->nullable()->after('registered_by_id');

            $table->foreign('account_manager_id')
                ->references('id')->on('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['account_manager_id']);
            $table->dropColumn('account_manager_id');
        });
    }
};
