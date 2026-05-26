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
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'status')) {
                $table->string('status')->default('Active')->after('last_sync_at');
            }
            if (!Schema::hasColumn('stores', 'suspension_reason')) {
                $table->text('suspension_reason')->nullable()->after('status');
            }
            if (!Schema::hasColumn('stores', 'show_retail_suggestions')) {
                $table->boolean('show_retail_suggestions')->default(false)->after('suspension_reason');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['status', 'suspension_reason', 'show_retail_suggestions']);
        });
    }
};
