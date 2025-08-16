import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common"
import type { SupabaseService } from "../supabase/supabase.service"
import type { CreateSaleDto } from "./dto/create-sale.dto"
import type { SalesReportDto } from "./dto/sales-report.dto"

@Injectable()
export class SalesService {
  constructor(private supabaseService: SupabaseService) {}

  async createSale(createSaleDto: CreateSaleDto, cashierId: string) {
    // Start transaction
    const { data: saleData, error: saleError } = await this.supabaseService.db
      .from("sales")
      .insert([
        {
          customer_id: createSaleDto.customer_id,
          cashier_id: cashierId,
          prescription_id: createSaleDto.prescription_id,
          subtotal: createSaleDto.subtotal,
          discount_amount: createSaleDto.discount_amount || 0,
          discount_percentage: createSaleDto.discount_percentage || 0,
          tax_amount: createSaleDto.tax_amount,
          tax_percentage: createSaleDto.tax_percentage || 7.5, // Nigerian VAT
          total_amount: createSaleDto.total_amount,
          payment_method: createSaleDto.payment_method,
          amount_paid: createSaleDto.amount_paid,
          change_given: createSaleDto.change_given || 0,
          points_earned: createSaleDto.points_earned || 0,
          points_redeemed: createSaleDto.points_redeemed || 0,
          notes: createSaleDto.notes,
        },
      ])
      .select()
      .single()

    if (saleError) {
      throw new Error(`Failed to create sale: ${saleError.message}`)
    }

    // Add sale items
    const saleItems = createSaleDto.items.map((item) => ({
      sale_id: saleData.id,
      medicine_id: item.medicine_id,
      inventory_id: item.inventory_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_amount: item.discount_amount || 0,
      total_price: item.total_price,
      cost_price: item.cost_price,
    }))

    const { error: itemsError } = await this.supabaseService.db.from("sale_items").insert(saleItems)

    if (itemsError) {
      throw new Error(`Failed to create sale items: ${itemsError.message}`)
    }

    // Update inventory quantities
    for (const item of createSaleDto.items) {
      await this.updateInventoryAfterSale(item.inventory_id, item.quantity, saleData.id, cashierId)
    }

    // Update customer loyalty points if customer exists
    if (createSaleDto.customer_id) {
      await this.updateCustomerLoyalty(
        createSaleDto.customer_id,
        createSaleDto.total_amount,
        createSaleDto.points_earned || 0,
        createSaleDto.points_redeemed || 0,
      )
    }

    // Get complete sale data with items
    return this.findOne(saleData.id)
  }

  private async updateInventoryAfterSale(inventoryId: string, quantity: number, saleId: string, userId: string) {
    // Get current inventory
    const { data: inventory, error: invError } = await this.supabaseService.db
      .from("inventory")
      .select("*")
      .eq("id", inventoryId)
      .single()

    if (invError || !inventory) {
      throw new Error("Inventory item not found")
    }

    if (inventory.quantity_in_stock < quantity) {
      throw new BadRequestException(`Insufficient stock for inventory item ${inventoryId}`)
    }

    // Update inventory quantity
    const { error: updateError } = await this.supabaseService.db
      .from("inventory")
      .update({
        quantity_in_stock: inventory.quantity_in_stock - quantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inventoryId)

    if (updateError) {
      throw new Error(`Failed to update inventory: ${updateError.message}`)
    }

    // Record stock movement
    await this.supabaseService.db.from("stock_movements").insert([
      {
        inventory_id: inventoryId,
        medicine_id: inventory.medicine_id,
        movement_type: "sale",
        quantity: -quantity, // negative for outbound
        unit_cost: inventory.cost_price,
        total_cost: inventory.cost_price * quantity,
        reference_id: saleId,
        reference_type: "sale",
        reason: "Sale transaction",
        performed_by: userId,
      },
    ])
  }

  private async updateCustomerLoyalty(
    customerId: string,
    totalAmount: number,
    pointsEarned: number,
    pointsRedeemed: number,
  ) {
    // Get current customer data
    const { data: customer, error: customerError } = await this.supabaseService.db
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .single()

    if (customerError || !customer) {
      return // Skip if customer not found
    }

    // Update customer totals
    const newTotalSpent = customer.total_spent + totalAmount
    const newLoyaltyPoints = customer.loyalty_points + pointsEarned - pointsRedeemed

    const { error: updateError } = await this.supabaseService.db
      .from("customers")
      .update({
        total_spent: newTotalSpent,
        loyalty_points: Math.max(0, newLoyaltyPoints),
        last_purchase_date: new Date().toISOString().split("T")[0],
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId)

    if (updateError) {
      throw new Error(`Failed to update customer loyalty: ${updateError.message}`)
    }

    // Record loyalty transactions
    if (pointsEarned > 0) {
      await this.supabaseService.db.from("loyalty_transactions").insert([
        {
          customer_id: customerId,
          transaction_type: "earned",
          points: pointsEarned,
          reference_type: "sale",
          description: `Points earned from purchase of ₦${totalAmount.toFixed(2)}`,
          expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 1 year
        },
      ])
    }

    if (pointsRedeemed > 0) {
      await this.supabaseService.db.from("loyalty_transactions").insert([
        {
          customer_id: customerId,
          transaction_type: "redeemed",
          points: -pointsRedeemed,
          reference_type: "sale",
          description: `Points redeemed for discount`,
        },
      ])
    }
  }

  async findAll(page = 1, limit = 50) {
    const offset = (page - 1) * limit

    const { data, error, count } = await this.supabaseService.db
      .from("sales")
      .select(
        `
        *,
        customers(id, first_name, last_name, customer_code),
        users!cashier_id(id, first_name, last_name),
        prescriptions(id, prescription_number)
      `,
        { count: "exact" },
      )
      .order("transaction_date", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`Failed to fetch sales: ${error.message}`)
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
      .from("sales")
      .select(`
        *,
        customers(id, first_name, last_name, customer_code, phone),
        users!cashier_id(id, first_name, last_name),
        prescriptions(id, prescription_number, doctor_name),
        sale_items(
          *,
          medicines(id, name, generic_name, strength),
          inventory(id, batch_number, expiry_date)
        )
      `)
      .eq("id", id)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        throw new NotFoundException("Sale not found")
      }
      throw new Error(`Failed to fetch sale: ${error.message}`)
    }

    return data
  }

  async getSalesReport(reportDto: SalesReportDto) {
    let query = this.supabaseService.db
      .from("sales")
      .select(`
        *,
        sale_items(quantity, total_price, profit)
      `)
      .eq("payment_status", "completed")

    // Apply date filters
    if (reportDto.start_date) {
      query = query.gte("transaction_date", reportDto.start_date)
    }

    if (reportDto.end_date) {
      query = query.lte("transaction_date", reportDto.end_date)
    }

    // Apply other filters
    if (reportDto.cashier_id) {
      query = query.eq("cashier_id", reportDto.cashier_id)
    }

    if (reportDto.payment_method) {
      query = query.eq("payment_method", reportDto.payment_method)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to generate sales report: ${error.message}`)
    }

    // Calculate summary statistics
    const totalSales = data.length
    const totalRevenue = data.reduce((sum, sale) => sum + sale.total_amount, 0)
    const totalProfit = data.reduce((sum, sale) => {
      return sum + sale.sale_items.reduce((itemSum, item) => itemSum + (item.profit || 0), 0)
    }, 0)
    const averageTransactionValue = totalSales > 0 ? totalRevenue / totalSales : 0

    // Group by payment method
    const paymentMethodBreakdown = data.reduce((acc, sale) => {
      const method = sale.payment_method
      if (!acc[method]) {
        acc[method] = { count: 0, total: 0 }
      }
      acc[method].count++
      acc[method].total += sale.total_amount
      return acc
    }, {})

    return {
      summary: {
        total_sales: totalSales,
        total_revenue: totalRevenue,
        total_profit: totalProfit,
        average_transaction_value: averageTransactionValue,
        profit_margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      },
      payment_method_breakdown: paymentMethodBreakdown,
      transactions: data,
    }
  }

  async getDailySales(date?: string) {
    const targetDate = date || new Date().toISOString().split("T")[0]

    const { data, error } = await this.supabaseService.db
      .from("sales")
      .select("*")
      .gte("transaction_date", `${targetDate}T00:00:00`)
      .lt("transaction_date", `${targetDate}T23:59:59`)
      .eq("payment_status", "completed")

    if (error) {
      throw new Error(`Failed to fetch daily sales: ${error.message}`)
    }

    const totalSales = data.length
    const totalRevenue = data.reduce((sum, sale) => sum + sale.total_amount, 0)
    const totalTax = data.reduce((sum, sale) => sum + sale.tax_amount, 0)

    return {
      date: targetDate,
      total_sales: totalSales,
      total_revenue: totalRevenue,
      total_tax: totalTax,
      transactions: data,
    }
  }

  async getTopSellingMedicines(limit = 10, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await this.supabaseService.db
      .from("sale_items")
      .select(`
        medicine_id,
        quantity,
        total_price,
        medicines(id, name, generic_name, strength)
      `)
      .gte("created_at", startDate)

    if (error) {
      throw new Error(`Failed to fetch top selling medicines: ${error.message}`)
    }

    // Group by medicine and calculate totals
    const medicineStats = data.reduce((acc, item) => {
      const medicineId = item.medicine_id
      if (!acc[medicineId]) {
        acc[medicineId] = {
          medicine: item.medicines,
          total_quantity: 0,
          total_revenue: 0,
          transaction_count: 0,
        }
      }
      acc[medicineId].total_quantity += item.quantity
      acc[medicineId].total_revenue += item.total_price
      acc[medicineId].transaction_count++
      return acc
    }, {})

    // Convert to array and sort by quantity
    const sortedMedicines = Object.values(medicineStats)
      .sort((a: any, b: any) => b.total_quantity - a.total_quantity)
      .slice(0, limit)

    return sortedMedicines
  }

  async refundSale(saleId: string, reason: string, userId: string) {
    // Get sale details
    const sale = await this.findOne(saleId)

    if (sale.payment_status === "refunded") {
      throw new BadRequestException("Sale has already been refunded")
    }

    // Update sale status
    const { error: updateError } = await this.supabaseService.db
      .from("sales")
      .update({
        payment_status: "refunded",
        notes: `${sale.notes || ""}\nRefunded: ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", saleId)

    if (updateError) {
      throw new Error(`Failed to refund sale: ${updateError.message}`)
    }

    // Restore inventory quantities
    for (const item of sale.sale_items) {
      await this.restoreInventoryAfterRefund(item.inventory_id, item.quantity, saleId, userId)
    }

    // Reverse customer loyalty points if applicable
    if (sale.customer_id) {
      await this.reverseCustomerLoyalty(sale.customer_id, sale.total_amount, sale.points_earned, sale.points_redeemed)
    }

    return { message: "Sale refunded successfully" }
  }

  private async restoreInventoryAfterRefund(inventoryId: string, quantity: number, saleId: string, userId: string) {
    // Get current inventory
    const { data: inventory } = await this.supabaseService.db
      .from("inventory")
      .select("*")
      .eq("id", inventoryId)
      .single()

    if (!inventory) return

    // Update inventory quantity
    await this.supabaseService.db
      .from("inventory")
      .update({
        quantity_in_stock: inventory.quantity_in_stock + quantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inventoryId)

    // Record stock movement
    await this.supabaseService.db.from("stock_movements").insert([
      {
        inventory_id: inventoryId,
        medicine_id: inventory.medicine_id,
        movement_type: "return",
        quantity: quantity, // positive for inbound
        unit_cost: inventory.cost_price,
        total_cost: inventory.cost_price * quantity,
        reference_id: saleId,
        reference_type: "refund",
        reason: "Sale refund",
        performed_by: userId,
      },
    ])
  }

  private async reverseCustomerLoyalty(
    customerId: string,
    totalAmount: number,
    pointsEarned: number,
    pointsRedeemed: number,
  ) {
    // Get current customer data
    const { data: customer } = await this.supabaseService.db.from("customers").select("*").eq("id", customerId).single()

    if (!customer) return

    // Update customer totals (reverse the transaction)
    const newTotalSpent = Math.max(0, customer.total_spent - totalAmount)
    const newLoyaltyPoints = customer.loyalty_points - pointsEarned + pointsRedeemed

    await this.supabaseService.db
      .from("customers")
      .update({
        total_spent: newTotalSpent,
        loyalty_points: Math.max(0, newLoyaltyPoints),
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId)

    // Record loyalty adjustment
    if (pointsEarned > 0) {
      await this.supabaseService.db.from("loyalty_transactions").insert([
        {
          customer_id: customerId,
          transaction_type: "adjusted",
          points: -pointsEarned,
          reference_type: "refund",
          description: `Points reversed due to sale refund`,
        },
      ])
    }
  }
}
