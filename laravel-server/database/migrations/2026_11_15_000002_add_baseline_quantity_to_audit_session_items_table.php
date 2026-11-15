<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_session_items', function (Blueprint $table) {
            $table->decimal('baseline_quantity', 15, 2)->nullable()->after('system_quantity');
        });
    }

    public function down(): void
    {
        Schema::table('audit_session_items', function (Blueprint $table) {
            $table->dropColumn('baseline_quantity');
        });
    }
};
