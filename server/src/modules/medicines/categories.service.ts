import { Injectable, NotFoundException, ConflictException } from "@nestjs/common"
import type { SupabaseService } from "../supabase/supabase.service"
import type { CreateCategoryDto } from "./dto/create-category.dto"
import type { UpdateCategoryDto } from "./dto/update-category.dto"

@Injectable()
export class CategoriesService {
  constructor(private supabaseService: SupabaseService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    // Check if category with same name already exists
    const { data: existing } = await this.supabaseService.db
      .from("categories")
      .select("id")
      .eq("name", createCategoryDto.name)
      .single()

    if (existing) {
      throw new ConflictException("Category with this name already exists")
    }

    const { data, error } = await this.supabaseService.db
      .from("categories")
      .insert([createCategoryDto])
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create category: ${error.message}`)
    }

    return data
  }

  async findAll() {
    const { data, error } = await this.supabaseService.db
      .from("categories")
      .select(`
        *,
        parent:parent_id(id, name),
        children:categories!parent_id(id, name, description)
      `)
      .eq("is_active", true)
      .order("name")

    if (error) {
      throw new Error(`Failed to fetch categories: ${error.message}`)
    }

    return data
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService.db
      .from("categories")
      .select(`
        *,
        parent:parent_id(id, name, description),
        children:categories!parent_id(id, name, description),
        medicine_count:medicines(count)
      `)
      .eq("id", id)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        throw new NotFoundException("Category not found")
      }
      throw new Error(`Failed to fetch category: ${error.message}`)
    }

    return data
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    const { data, error } = await this.supabaseService.db
      .from("categories")
      .update({ ...updateCategoryDto, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        throw new NotFoundException("Category not found")
      }
      throw new Error(`Failed to update category: ${error.message}`)
    }

    return data
  }

  async remove(id: string) {
    // Check if category has medicines
    const { data: medicines } = await this.supabaseService.db
      .from("medicines")
      .select("id")
      .eq("category_id", id)
      .limit(1)

    if (medicines && medicines.length > 0) {
      throw new ConflictException("Cannot delete category that has medicines")
    }

    // Soft delete by setting is_active to false
    const { error } = await this.supabaseService.db
      .from("categories")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) {
      throw new Error(`Failed to delete category: ${error.message}`)
    }

    return { message: "Category deleted successfully" }
  }

  async getTopCategories(limit = 10) {
    const { data, error } = await this.supabaseService.db
      .from("categories")
      .select(`
        *,
        medicine_count:medicines(count)
      `)
      .eq("is_active", true)
      .order("medicine_count", { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to fetch top categories: ${error.message}`)
    }

    return data
  }
}
