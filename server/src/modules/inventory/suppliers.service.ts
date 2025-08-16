import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common"
import type { SupabaseService } from "../supabase/supabase.service"
import type { CreateSupplierDto } from "./dto/create-supplier.dto"
import type { UpdateSupplierDto } from "./dto/update-supplier.dto"

@Injectable()
export class SuppliersService {
  constructor(private supabaseService: SupabaseService) {}

  async create(createSupplierDto: CreateSupplierDto) {
    // Check if supplier with same name already exists
    const { data: existing } = await this.supabaseService.db
      .from("suppliers")
      .select("id")
      .eq("name", createSupplierDto.name)
      .single()

    if (existing) {
      throw new ConflictException("Supplier with this name already exists")
    }

    const { data, error } = await this.supabaseService.db
      .from("suppliers")
      .insert([createSupplierDto])
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create supplier: ${error.message}`)
    }

    return data
  }

  async findAll(page = 1, limit = 50) {
    const offset = (page - 1) * limit

    const { data, error, count } = await this.supabaseService.db
      .from("suppliers")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .order("name")
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`Failed to fetch suppliers: ${error.message}`)
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    }
  }

  async findOne(id: string) {
    const { data, error } = await this.supabaseService.db.from("suppliers").select("*").eq("id", id).single()

    if (error) {
      if (error.code === "PGRST116") {
        throw new NotFoundException("Supplier not found")
      }
      throw new Error(`Failed to fetch supplier: ${error.message}`)
    }

    return data
  }

  async update(id: string, updateSupplierDto: UpdateSupplierDto) {
    const { data, error } = await this.supabaseService.db
      .from("suppliers")
      .update({ ...updateSupplierDto, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        throw new NotFoundException("Supplier not found")
      }
      throw new Error(`Failed to update supplier: ${error.message}`)
    }

    return data
  }

  async remove(id: string) {
    // Check if supplier has inventory items
    const { data: inventory } = await this.supabaseService.db
      .from("inventory")
      .select("id")
      .eq("supplier_id", id)
      .limit(1)

    if (inventory && inventory.length > 0) {
      throw new ConflictException("Cannot delete supplier that has inventory items")
    }

    // Soft delete by setting is_active to false
    const { error } = await this.supabaseService.db
      .from("suppliers")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) {
      throw new Error(`Failed to delete supplier: ${error.message}`)
    }

    return { message: "Supplier deleted successfully" }
  }

  async updateRating(id: string, rating: number) {
    if (rating < 0 || rating > 5) {
      throw new BadRequestException("Rating must be between 0 and 5")
    }

    const { data, error } = await this.supabaseService.db
      .from("suppliers")
      .update({ rating, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update supplier rating: ${error.message}`)
    }

    return data
  }

  async getTopSuppliers(limit = 10) {
    const { data, error } = await this.supabaseService.db
      .from("suppliers")
      .select("*")
      .eq("is_active", true)
      .order("rating", { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to fetch top suppliers: ${error.message}`)
    }

    return data
  }
}
