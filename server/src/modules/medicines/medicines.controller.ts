import { Controller, Get, Post, Patch, Delete, UseGuards } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from "@nestjs/swagger"
import type { MedicinesService } from "./medicines.service"
import type { CreateMedicineDto } from "./dto/create-medicine.dto"
import type { UpdateMedicineDto } from "./dto/update-medicine.dto"
import type { SearchMedicinesDto } from "./dto/search-medicines.dto"
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { RolesGuard } from "../auth/guards/roles.guard"
import { Roles } from "../auth/decorators/roles.decorator"

@ApiTags("Medicines")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("medicines")
export class MedicinesController {
  constructor(private readonly medicinesService: MedicinesService) {}

  @ApiOperation({ summary: "Create a new medicine" })
  @ApiResponse({ status: 201, description: "Medicine created successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "manager", "pharmacist")
  @Post()
  create(createMedicineDto: CreateMedicineDto) {
    return this.medicinesService.create(createMedicineDto)
  }

  @ApiOperation({ summary: "Get all medicines with pagination" })
  @ApiResponse({ status: 200, description: "Medicines retrieved successfully" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @Get()
  findAll(page?: number, limit?: number) {
    return this.medicinesService.findAll(page, limit)
  }

  @ApiOperation({ summary: "Search medicines with filters" })
  @ApiResponse({ status: 200, description: "Search results retrieved successfully" })
  @Get("search")
  search(searchDto: SearchMedicinesDto) {
    return this.medicinesService.search(searchDto)
  }

  @ApiOperation({ summary: "Get popular medicines" })
  @ApiResponse({ status: 200, description: "Popular medicines retrieved successfully" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @Get("popular")
  getPopular(limit?: number) {
    return this.medicinesService.getPopularMedicines(limit)
  }

  @ApiOperation({ summary: "Find medicine by barcode" })
  @ApiResponse({ status: 200, description: "Medicine found successfully" })
  @Get("barcode/:barcode")
  findByBarcode(barcode: string) {
    return this.medicinesService.findByBarcode(barcode)
  }

  @ApiOperation({ summary: "Get medicine by ID" })
  @ApiResponse({ status: 200, description: "Medicine retrieved successfully" })
  @Get(":id")
  findOne(id: string) {
    return this.medicinesService.findOne(id)
  }

  @ApiOperation({ summary: "Update medicine" })
  @ApiResponse({ status: 200, description: "Medicine updated successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "manager", "pharmacist")
  @Patch(":id")
  update(id: string, updateMedicineDto: UpdateMedicineDto) {
    return this.medicinesService.update(id, updateMedicineDto)
  }

  @ApiOperation({ summary: "Update medicine pricing" })
  @ApiResponse({ status: 200, description: "Pricing updated successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "manager")
  @Patch(":id/pricing")
  updatePricing(id: string, pricingDto: { cost_price: number; selling_price: number }) {
    return this.medicinesService.updatePricing(id, pricingDto.cost_price, pricingDto.selling_price)
  }

  @ApiOperation({ summary: "Delete medicine (soft delete)" })
  @ApiResponse({ status: 200, description: "Medicine deleted successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "manager")
  @Delete(":id")
  remove(id: string) {
    return this.medicinesService.remove(id)
  }
}
