<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    private const RESERVED = ['catalog', 'checkout', 'order', 'about', 'faq', 'locations', 'track', 'prescription', 'p'];

    public function up(): void
    {
        Schema::create('storefront_branches', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('store_id')->unique()->constrained('stores')->cascadeOnDelete();
            $table->foreignUuid('user_id')->index();
            $table->string('slug', 60);
            $table->timestamps();

            $table->unique(['user_id', 'slug']);
        });

        $taken = [];
        DB::table('stores')->where('online_store_enabled', true)->whereNull('deleted_at')->orderBy('created_at')->get(['id', 'user_id', 'name'])
            ->each(function ($store) use (&$taken) {
                $base = Str::limit(Str::slug($store->name), 40, '') ?: 'branch';
                $slug = $base;
                for ($n = 2; in_array($slug, self::RESERVED, true) || isset($taken[$store->user_id][$slug]); $n++) {
                    $slug = "{$base}-{$n}";
                }
                $taken[$store->user_id][$slug] = true;

                DB::table('storefront_branches')->insert([
                    'id' => (string) Str::uuid(), 'store_id' => $store->id, 'user_id' => $store->user_id,
                    'slug' => $slug, 'created_at' => now(), 'updated_at' => now(),
                ]);
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('storefront_branches');
    }
};
