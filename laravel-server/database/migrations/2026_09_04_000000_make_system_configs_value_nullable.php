<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Superadmin "Disable Widget" (IntegrationsTab::handleClear) sends
 * value: "" to clear a config key. Laravel's ConvertEmptyStringsToNull
 * middleware turns that into a PHP null before it reaches the controller,
 * so SystemConfig::setVal() tries to save a null into this column — which
 * the original migration made NOT NULL, causing a 500 (previously masked
 * by validation rejecting the request with a 422 first). Making the column
 * nullable lets a config key be legitimately "unset"/disabled.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('system_configs', function (Blueprint $table) {
            $table->json('value')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('system_configs', function (Blueprint $table) {
            $table->json('value')->nullable(false)->change();
        });
    }
};
