import { Controller, Get, Post, Patch, UseGuards } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from "@nestjs/swagger"
import type { InventoryService } from "./inventory.service"
import type { CreateInventoryDto } from "./dto/create-inventory.dto"
import type { UpdateInventoryDto } from "./dto/update-inventory.dto"
import type { StockAdjustmentDto } from "./dto/stock-adjustment.dto"
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { RolesGuard } from "../auth/guards/roles.guard"
import { Roles } from "../auth/decorators/roles.decorator"

@ApiTags("Inventory")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @ApiOperation({ summary: "Add new inventory item" })
  @ApiResponse({ status: 201, description: "Inventory item created successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "manager", "pharmacist")
  @Post()
  create(createInventoryDto: CreateInventoryDto) {
    return this.inventoryService.create(createInventoryDto)
  }

  @ApiOperation({ summary: "Get all inventory items with pagination" })
  @ApiResponse({ status: 200, description: "Inventory items retrieved successfully" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @Get()
  findAll(page?: number, limit?: number) {
    return this.inventoryService.findAll(page, limit)
  }

  @ApiOperation({ summary: "Get low stock items" })
  @ApiResponse({ status: 200, description: "Low stock items retrieved successfully" })
  @Get("low-stock")
  getLowStock() {
    return this.inventoryService.getLowStockItems()
  }

  @ApiOperation({ summary: "Get expiring items" })
  @ApiResponse({ status: 200, description: "Expiring items retrieved successfully" })
  @ApiQuery({ name: "days", required: false, type: Number, description: "Days until expiry (default: 90)" })
  @Get("expiring")
  getExpiring(days?: number) {
    return this.inventoryService.getExpiringItems(days)
  }

  @ApiOperation({ summary: "Get inventory value summary" })
  @ApiResponse({ status: 200, description: "Inventory value retrieved successfully" })
  @Get("value")
  getInventoryValue() {
    return this.inventoryService.getInventoryValue()
  }

  @ApiOperation({ summary: "Search inventory items" })
  @ApiResponse({ status: 200, description: "Search results retrieved successfully" })
  @Get("search")
  search(query: string) {
    return this.inventoryService.searchInventory(query)
  }

  @ApiOperation({ summary: "Get inventory by medicine ID" })
  @ApiResponse({ status: 200, description: "Medicine inventory retrieved successfully" })
  @Get("medicine/:medicineId")
  getByMedicine(medicineId: string) {
    return this.inventoryService.getInventoryByMedicine(medicineId)
  }

  @ApiOperation({ summary: "Get inventory item by ID" })
  @ApiResponse({ status: 200, description: "Inventory item retrieved successfully" })
  @Get(":id")
  findOne(id: string) {
    return this.inventoryService.findOne(id)
  }

  @ApiOperation({ summary: "Update inventory item" })
  @ApiResponse({ status: 200, description: "Inventory item updated successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "manager", "pharmacist")
  @Patch(":id")
  update(id: string, updateInventoryDto: UpdateInventoryDto) {
    return this.inventoryService.update(id, updateInventoryDto)
  }

  @ApiOperation({ summary: "Adjust stock quantity" })
  @ApiResponse({ status: 200, description: "Stock adjusted successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "manager", "pharmacist")
  @Patch(":id/adjust")
  adjustStock(id: string, adjustmentDto: StockAdjustmentDto, req: any) {
    return this.inventoryService.adjustStock(id, adjustmentDto, req.user.id)
  }

  @ApiOperation({ summary: "Update inventory status" })
  @ApiResponse({ status: 200, description: "Status updated successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "manager", "pharmacist")
  @Patch(":id/status")
  updateStatus(id: string, statusDto: { status: string; reason?: string }) {
    return this.inventoryService.updateStatus(id, statusDto.status, statusDto.reason)
  }
}
