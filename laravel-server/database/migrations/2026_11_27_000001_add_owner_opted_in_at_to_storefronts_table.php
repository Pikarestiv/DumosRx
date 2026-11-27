<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('storefronts', function (Blueprint $table) {
            $table->timestamp('owner_opted_in_at')->nullable()->after('applied_plan');
            $table->string('opted_in_by', 16)->nullable()->after('owner_opted_in_at');
        });
    }

    public function down(): void
    {
        Schema::table('storefronts', function (Blueprint $table) {
            $table->dropColumn(['owner_opted_in_at', 'opted_in_by']);
        });
    }
};
