import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common"
import type { SupabaseService } from "../supabase/supabase.service"
import type { CreateInventoryDto } from "./dto/create-inventory.dto"
import type { UpdateInventoryDto } from "./dto/update-inventory.dto"
import type { StockAdjustmentDto } from "./dto/stock-adjustment.dto"

@Injectable()
export class InventoryService {
  constructor(private supabaseService: SupabaseService) {}

  async create(createInventoryDto: CreateInventoryDto) {
    // Check if inventory with same medicine and batch already exists
    const { data: existing } = await this.supabaseService.db
      .from("inventory")
      .select("id")
      .eq("medicine_id", createInventoryDto.medicine_id)
      .eq("batch_number", createInventoryDto.batch_number)
      .single()

    if (existing) {
      throw new BadRequestException("Inventory with same medicine and batch number already exists")
    }

    const { data, error } = await this.supabaseService.db
      .from("inventory")
      .insert([createInventoryDto])
      .select(`
        *,
        medicines(id, name, generic_name, strength),
        suppliers(id, name)
      `)
      .single()

    if (error) {
      throw new Error(`Failed to create inventory: ${error.message}`)
    }

    return data
  }

  async findAll(page = 1, limit = 50) {
    const offset = (page - 1) * limit

    const { data, error, count } = await this.supabaseService.db
      .from("inventory")
      .select(
        `
        *,
        medicines(id, name, generic_name, strength, unit_of_measure),
        suppliers(id, name, contact_person)
      `,
        { count: "exact" },
      )
      .eq("status", "active")
      .order("expiry_date")
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`Failed to fetch inventory: ${error.message}`)
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
      .from("inventory")
      .select(`
        *,
        medicines(id, name, generic_name, brand_name, strength, dosage_form, unit_of_measure),
        suppliers(id, name, contact_person, phone, email)
      `)
      .eq("id", id)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        throw new NotFoundException("Inventory item not found")
      }
      throw new Error(`Failed to fetch inventory item: ${error.message}`)
    }

    return data
  }

  async update(id: string, updateInventoryDto: UpdateInventoryDto) {
    const { data, error } = await this.supabaseService.db
      .from("inventory")
      .update({ ...updateInventoryDto, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(`
        *,
        medicines(id, name, generic_name, strength),
        suppliers(id, name)
      `)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        throw new NotFoundException("Inventory item not found")
      }
      throw new Error(`Failed to update inventory: ${error.message}`)
    }

    return data
  }

  async adjustStock(id: string, adjustmentDto: StockAdjustmentDto, userId: string) {
    // Get current inventory item
    const currentItem = await this.findOne(id)

    const newQuantity = currentItem.quantity_in_stock + adjustmentDto.quantity_change

    if (newQuantity < 0) {
      throw new BadRequestException("Insufficient stock for this adjustment")
    }

    // Update inventory
    const { data, error } = await this.supabaseService.db
      .from("inventory")
      .update({
        quantity_in_stock: newQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to adjust stock: ${error.message}`)
    }

    // Record stock movement
    await this.supabaseService.db.from("stock_movements").insert([
      {
        inventory_id: id,
        medicine_id: currentItem.medicine_id,
        movement_type: "adjustment",
        quantity: adjustmentDto.quantity_change,
        unit_cost: currentItem.cost_price,
        total_cost: currentItem.cost_price * Math.abs(adjustmentDto.quantity_change),
        reason: adjustmentDto.reason,
        performed_by: userId,
      },
    ])

    return data
  }

  async getLowStockItems() {
    const { data, error } = await this.supabaseService.db.from("low_stock_medicines").select("*")

    if (error) {
      throw new Error(`Failed to fetch low stock items: ${error.message}`)
    }

    return data
  }

  async getExpiringItems(days = 90) {
    const { data, error } = await this.supabaseService.db
      .from("expiring_medicines")
      .select("*")
      .lte("days_to_expiry", days)

    if (error) {
      throw new Error(`Failed to fetch expiring items: ${error.message}`)
    }

    return data
  }

  async getInventoryByMedicine(medicineId: string) {
    const { data, error } = await this.supabaseService.db
      .from("inventory")
      .select(`
        *,
        suppliers(id, name)
      `)
      .eq("medicine_id", medicineId)
      .eq("status", "active")
      .order("expiry_date")

    if (error) {
      throw new Error(`Failed to fetch inventory by medicine: ${error.message}`)
    }

    return data
  }

  async getInventoryValue() {
    const { data, error } = await this.supabaseService.db
      .from("inventory")
      .select("quantity_in_stock, cost_price")
      .eq("status", "active")

    if (error) {
      throw new Error(`Failed to calculate inventory value: ${error.message}`)
    }

    const totalValue = data.reduce((sum, item) => {
      return sum + item.quantity_in_stock * item.cost_price
    }, 0)

    return {
      total_items: data.length,
      total_value: totalValue,
      average_value_per_item: data.length > 0 ? totalValue / data.length : 0,
    }
  }

  async searchInventory(query: string) {
    const { data, error } = await this.supabaseService.db
      .from("inventory")
      .select(`
        *,
        medicines(id, name, generic_name, brand_name, strength),
        suppliers(id, name)
      `)
      .or(`batch_number.ilike.%${query}%,medicines.name.ilike.%${query}%,medicines.generic_name.ilike.%${query}%`)
      .eq("status", "active")
      .limit(50)

    if (error) {
      throw new Error(`Failed to search inventory: ${error.message}`)
    }

    return data
  }

  async updateStatus(id: string, status: string, reason?: string) {
    const { data, error } = await this.supabaseService.db
      .from("inventory")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update inventory status: ${error.message}`)
    }

    return data
  }
}
