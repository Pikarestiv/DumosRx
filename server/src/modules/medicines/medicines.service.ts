import { Injectable, NotFoundException, ConflictException } from "@nestjs/common"
import { SupabaseService } from "../supabase/supabase.service"
import type { CreateMedicineDto } from "./dto/create-medicine.dto"
import type { UpdateMedicineDto } from "./dto/update-medicine.dto"
import type { SearchMedicinesDto } from "./dto/search-medicines.dto"

@Injectable()
export class MedicinesService {
  constructor(private supabaseService: SupabaseService) {}

  async create(createMedicineDto: CreateMedicineDto) {
    // Check if medicine with same name and strength already exists
    const { data: existing } = await this.supabaseService.db
      .from("medicines")
      .select("id")
      .eq("name", createMedicineDto.name)
      .eq("strength", createMedicineDto.strength)
      .single()

    if (existing) {
      throw new ConflictException("Medicine with same name and strength already exists")
    }

    const { data, error } = await this.supabaseService.db
      .from("medicines")
      .insert([createMedicineDto])
      .select(`
        *,
        categories(id, name),
        suppliers(id, name)
      `)
      .single()

    if (error) {
      throw new Error(`Failed to create medicine: ${error.message}`)
    }

    return data
  }

  async findAll(page = 1, limit = 50) {
    const offset = (page - 1) * limit

    const { data, error, count } = await this.supabaseService.db
      .from("medicines")
      .select(
        `
        *,
        categories(id, name),
        suppliers(id, name)
      `,
        { count: "exact" },
      )
      .eq("is_active", true)
      .order("name")
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`Failed to fetch medicines: ${error.message}`)
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
    const { data, error } = await this.supabaseService.db
      .from("medicines")
      .select(`
        *,
        categories(id, name, description),
        suppliers(id, name, contact_person, phone, email)
      `)
      .eq("id", id)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        throw new NotFoundException("Medicine not found")
      }
      throw new Error(`Failed to fetch medicine: ${error.message}`)
    }

    return data
  }

  async update(id: string, updateMedicineDto: UpdateMedicineDto) {
    const { data, error } = await this.supabaseService.db
      .from("medicines")
      .update({ ...updateMedicineDto, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(`
        *,
        categories(id, name),
        suppliers(id, name)
      `)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        throw new NotFoundException("Medicine not found")
      }
      throw new Error(`Failed to update medicine: ${error.message}`)
    }

    return data
  }

  async remove(id: string) {
    // Soft delete by setting is_active to false
    const { error } = await this.supabaseService.db
      .from("medicines")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) {
      throw new Error(`Failed to delete medicine: ${error.message}`)
    }

    return { message: "Medicine deleted successfully" }
  }

  async search(searchDto: SearchMedicinesDto) {
    let query = this.supabaseService.db
      .from("medicines")
      .select(
        `
        *,
        categories(id, name),
        suppliers(id, name)
      `,
        { count: "exact" },
      )
      .eq("is_active", true)

    // Apply filters
    if (searchDto.name) {
      query = query.ilike("name", `%${searchDto.name}%`)
    }

    if (searchDto.generic_name) {
      query = query.ilike("generic_name", `%${searchDto.generic_name}%`)
    }

    if (searchDto.category_id) {
      query = query.eq("category_id", searchDto.category_id)
    }

    if (searchDto.manufacturer) {
      query = query.ilike("manufacturer", `%${searchDto.manufacturer}%`)
    }

    if (searchDto.nafdac_number) {
      query = query.ilike("nafdac_number", `%${searchDto.nafdac_number}%`)
    }

    if (searchDto.requires_prescription !== undefined) {
      query = query.eq("requires_prescription", searchDto.requires_prescription)
    }

    if (searchDto.is_controlled !== undefined) {
      query = query.eq("is_controlled", searchDto.is_controlled)
    }

    if (searchDto.min_price) {
      query = query.gte("selling_price", searchDto.min_price)
    }

    if (searchDto.max_price) {
      query = query.lte("selling_price", searchDto.max_price)
    }

    // Apply sorting
    const sortField = searchDto.sort_by || "name"
    const sortOrder = searchDto.sort_order === "desc" ? { ascending: false } : { ascending: true }
    query = query.order(sortField, sortOrder)

    // Apply pagination
    const page = searchDto.page || 1
    const limit = searchDto.limit || 50
    const offset = (page - 1) * limit
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      throw new Error(`Failed to search medicines: ${error.message}`)
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

  async findByBarcode(barcode: string) {
    const { data, error } = await this.supabaseService.db
      .from("medicines")
      .select(`
        *,
        categories(id, name),
        suppliers(id, name)
      `)
      .eq("barcode", barcode)
      .eq("is_active", true)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        throw new NotFoundException("Medicine not found")
      }
      throw new Error(`Failed to find medicine by barcode: ${error.message}`)
    }

    return data
  }

  async updatePricing(id: string, costPrice: number, sellingPrice: number) {
    const markupPercentage = costPrice > 0 ? ((sellingPrice - costPrice) / costPrice) * 100 : 0

    const { data, error } = await this.supabaseService.db
      .from("medicines")
      .update({
        cost_price: costPrice,
        selling_price: sellingPrice,
        markup_percentage: markupPercentage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update pricing: ${error.message}`)
    }

    return data
  }

  async getPopularMedicines(limit = 10) {
    // This would typically join with sales data, but for now we'll return recent medicines
    const { data, error } = await this.supabaseService.db
      .from("medicines")
      .select(`
        *,
        categories(id, name)
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to fetch popular medicines: ${error.message}`)
    }

    return data
  }
}
