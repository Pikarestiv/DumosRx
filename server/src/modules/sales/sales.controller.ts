import { Controller, Get, Post, Patch, UseGuards } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from "@nestjs/swagger"
import type { SalesService } from "./sales.service"
import type { CreateSaleDto } from "./dto/create-sale.dto"
import type { SalesReportDto } from "./dto/sales-report.dto"
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { RolesGuard } from "../auth/guards/roles.guard"
import { Roles } from "../auth/decorators/roles.decorator"

@ApiTags("Sales")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("sales")
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @ApiOperation({ summary: "Create a new sale transaction" })
  @ApiResponse({ status: 201, description: "Sale created successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "manager", "pharmacist", "sales_staff")
  @Post()
  create(createSaleDto: CreateSaleDto, req: any) {
    return this.salesService.createSale(createSaleDto, req.user.id)
  }

  @ApiOperation({ summary: "Get all sales with pagination" })
  @ApiResponse({ status: 200, description: "Sales retrieved successfully" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @Get()
  findAll(page?: number, limit?: number) {
    return this.salesService.findAll(page, limit)
  }

  @ApiOperation({ summary: "Generate sales report" })
  @ApiResponse({ status: 200, description: "Sales report generated successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "manager", "auditor")
  @Post("report")
  generateReport(reportDto: SalesReportDto) {
    return this.salesService.getSalesReport(reportDto)
  }

  @ApiOperation({ summary: "Get daily sales summary" })
  @ApiResponse({ status: 200, description: "Daily sales retrieved successfully" })
  @ApiQuery({ name: "date", required: false, type: String, description: "Date in YYYY-MM-DD format" })
  @Get("daily")
  getDailySales(date?: string) {
    return this.salesService.getDailySales(date)
  }

  @ApiOperation({ summary: "Get top selling medicines" })
  @ApiResponse({ status: 200, description: "Top selling medicines retrieved successfully" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "days", required: false, type: Number })
  @Get("top-medicines")
  getTopSellingMedicines(limit?: number, days?: number) {
    return this.salesService.getTopSellingMedicines(limit, days)
  }

  @ApiOperation({ summary: "Get sale by ID" })
  @ApiResponse({ status: 200, description: "Sale retrieved successfully" })
  @Get(":id")
  findOne(id: string) {
    return this.salesService.findOne(id)
  }

  @ApiOperation({ summary: "Refund a sale" })
  @ApiResponse({ status: 200, description: "Sale refunded successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "manager")
  @Patch(":id/refund")
  refund(id: string, refundDto: { reason: string }, req: any) {
    return this.salesService.refundSale(id, refundDto.reason, req.user.id)
  }
}
