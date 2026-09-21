<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->text('receipt_tagline')->nullable()->after('receipt_header');
            $table->boolean('show_phone_on_receipt')->default(true)->after('show_contact_on_receipt');
            $table->boolean('show_address_on_receipt')->default(true)->after('show_phone_on_receipt');
        });

        // Preserve existing behavior: stores that had turned off
        // show_contact_on_receipt (combined phone+address) should keep both
        // hidden under the new split toggles, rather than reverting to the
        // new columns' own "shown" default.
        DB::table('stores')
            ->where('show_contact_on_receipt', false)
            ->update([
                'show_phone_on_receipt' => false,
                'show_address_on_receipt' => false,
            ]);
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['receipt_tagline', 'show_phone_on_receipt', 'show_address_on_receipt']);
        });
    }
};
