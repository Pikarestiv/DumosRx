import { Controller, Get, Post, Patch, Delete, UseGuards } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from "@nestjs/swagger"
import { SuppliersService } from "./suppliers.service"
import type { CreateSupplierDto } from "./dto/create-supplier.dto"
import type { UpdateSupplierDto } from "./dto/update-supplier.dto"
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { RolesGuard } from "../auth/guards/roles.guard"
import { Roles } from "../auth/decorators/roles.decorator"

@ApiTags("Suppliers")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @ApiOperation({ summary: "Create a new supplier" })
  @ApiResponse({ status: 201, description: "Supplier created successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "admin", "manager")
  @Post()
  create(createSupplierDto: CreateSupplierDto) {
    return this.suppliersService.create(createSupplierDto)
  }

  @ApiOperation({ summary: "Get all suppliers with pagination" })
  @ApiResponse({ status: 200, description: "Suppliers retrieved successfully" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @Get()
  findAll(page?: number, limit?: number) {
    return this.suppliersService.findAll(page, limit)
  }

  @ApiOperation({ summary: "Get top rated suppliers" })
  @ApiResponse({ status: 200, description: "Top suppliers retrieved successfully" })
  @Get("top")
  getTop(limit?: number) {
    return this.suppliersService.getTopSuppliers(limit)
  }

  @ApiOperation({ summary: "Get supplier by ID" })
  @ApiResponse({ status: 200, description: "Supplier retrieved successfully" })
  @Get(":id")
  findOne(id: string) {
    return this.suppliersService.findOne(id)
  }

  @ApiOperation({ summary: "Update supplier" })
  @ApiResponse({ status: 200, description: "Supplier updated successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "admin", "manager")
  @Patch(":id")
  update(id: string, updateSupplierDto: UpdateSupplierDto) {
    return this.suppliersService.update(id, updateSupplierDto)
  }

  @ApiOperation({ summary: "Update supplier rating" })
  @ApiResponse({ status: 200, description: "Rating updated successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "admin", "manager", "pharmacist")
  @Patch(":id/rating")
  updateRating(id: string, ratingDto: { rating: number }) {
    return this.suppliersService.updateRating(id, ratingDto.rating)
  }

  @ApiOperation({ summary: "Delete supplier" })
  @ApiResponse({ status: 200, description: "Supplier deleted successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "admin", "manager")
  @Delete(":id")
  remove(id: string) {
    return this.suppliersService.remove(id)
  }
}
