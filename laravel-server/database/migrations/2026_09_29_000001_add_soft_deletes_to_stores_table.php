<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'deleted_at')) {
                $table->softDeletes()->index();
            }
            if (!Schema::hasColumn('stores', 'deleted_by_id')) {
                $table->uuid('deleted_by_id')->nullable()->after('deleted_at');
            }
            if (!Schema::hasColumn('stores', 'deletion_reason')) {
                $table->string('deletion_reason', 1000)->nullable()->after('deleted_by_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['deleted_at', 'deleted_by_id', 'deletion_reason']);
        });
    }
};
