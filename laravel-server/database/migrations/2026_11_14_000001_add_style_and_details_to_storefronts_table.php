<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('storefronts', function (Blueprint $table) {
            $table->string('accent', 7)->nullable()->after('theme');
            $table->string('tagline')->nullable()->after('headline');
            $table->string('whatsapp', 32)->nullable()->after('banner_url');
            $table->unsignedSmallInteger('pickup_minutes')->nullable()->after('whatsapp');
            $table->json('opening_hours')->nullable()->after('pickup_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('storefronts', function (Blueprint $table) {
            $table->dropColumn(['accent', 'tagline', 'whatsapp', 'pickup_minutes', 'opening_hours']);
        });
    }
};
