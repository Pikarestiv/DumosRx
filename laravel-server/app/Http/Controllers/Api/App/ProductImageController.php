<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\ProductImages\ProductImageAccess;
use App\Services\ProductImages\ProductImageRejected;
use App\Services\ProductImages\ProductImageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductImageController extends Controller
{
    public function __construct(
        private ProductImageService $images,
        private ProductImageAccess $access,
    ) {}

    public function config(): JsonResponse
    {
        return response()->json($this->images->clientConfig());
    }

    public function presign(Request $request, string $product): JsonResponse
    {
        $target = $this->editableProduct($request, $product);

        $data = $request->validate([
            'content_type' => ['required', 'string', Rule::in(array_keys($this->images->allowedTypes()))],
            'content_length' => ['required', 'integer', 'min:1', 'max:'.$this->images->maxBytes()],
        ]);

        return response()->json($this->images->presign($target, $data['content_type']));
    }

    public function confirm(Request $request, string $product): JsonResponse
    {
        $target = $this->editableProduct($request, $product);
        $data = $request->validate(['key' => ['required', 'string', 'max:255']]);

        try {
            return $this->imageResponse($this->images->confirm($target, $data['key']));
        } catch (ProductImageRejected $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function destroy(Request $request, string $product): JsonResponse
    {
        return $this->imageResponse($this->images->remove($this->editableProduct($request, $product)));
    }

    private function editableProduct(Request $request, string $productId): Product
    {
        abort_unless($this->images->isEnabled(), 404);

        $product = $this->access->findInScope($request->user(), $productId);
        abort_unless($product !== null, 404, 'Product not found.');
        abort_unless($this->access->mayEditProducts($request->user()), 403, 'You do not have permission to manage products.');

        return $product;
    }

    private function imageResponse(Product $product): JsonResponse
    {
        return response()->json([
            'id' => $product->id,
            'image_key' => $product->image_key,
            'image_url' => $this->images->publicUrl($product->image_key),
        ]);
    }
}
