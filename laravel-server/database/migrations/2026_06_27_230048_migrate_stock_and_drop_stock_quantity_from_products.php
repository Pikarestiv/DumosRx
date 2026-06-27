<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('products') && Schema::hasColumn('products', 'stock_quantity') && Schema::hasTable('stock_batches')) {
            $productsWithStock = DB::table('products')->where('stock_quantity', '>', 0)->get();

            foreach ($productsWithStock as $product) {
                $existingBatch = DB::table('stock_batches')
                    ->where('product_id', $product->id)
                    ->where('batch_number', 'INITIAL')
                    ->first();

                if (!$existingBatch) {
                    DB::table('stock_batches')->insert([
                        'id' => (string) Str::uuid(),
                        'product_id' => $product->id,
                        'batch_number' => 'INITIAL',
                        'quantity_in_stock' => $product->stock_quantity,
                        'cost_price' => $product->cost_price ?? 0,
                        'selling_price' => $product->selling_price ?? 0,
                        'expiry_date' => now()->addYears(2)->toDateString(),
                        'status' => 'active',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        }

        if (Schema::hasColumn('products', 'stock_quantity')) {
            Schema::table('products', function (Blueprint $table) {
                $table->dropColumn('stock_quantity');
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasColumn('products', 'stock_quantity')) {
            Schema::table('products', function (Blueprint $table) {
                $table->integer('stock_quantity')->default(0)->after('markup_percentage');
            });
        }
    }
};
