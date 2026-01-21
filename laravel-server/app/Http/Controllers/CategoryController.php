<?php

namespace App\Http\Controllers;

use App\Models\Category;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function index()
    {
        $categories = Category::all();
        return response()->json($categories);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|unique:categories|max:255',
            'description' => 'nullable|string',
        ]);

        $category = Category::create($request->all());
        return response()->json($category, 201);
    }
}
