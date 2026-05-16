import { Controller, Get, Post, Patch, Param, Delete, UseGuards, Query } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger"
import { CategoriesService } from "./categories.service"
import type { CreateCategoryDto } from "./dto/create-category.dto"
import type { UpdateCategoryDto } from "./dto/update-category.dto"
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { RolesGuard } from "../auth/guards/roles.guard"
import { Roles } from "../auth/decorators/roles.decorator"

@ApiTags("Categories")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @ApiOperation({ summary: "Create a new category" })
  @ApiResponse({ status: 201, description: "Category created successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "admin", "manager", "pharmacist")
  @Post()
  create(createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto)
  }

  @ApiOperation({ summary: "Get all categories" })
  @ApiResponse({ status: 200, description: "Categories retrieved successfully" })
  @Get()
  findAll() {
    return this.categoriesService.findAll()
  }

  @ApiOperation({ summary: "Get top categories by medicine count" })
  @ApiResponse({ status: 200, description: "Top categories retrieved successfully" })
  @Get("top")
  getTop(@Query("limit") limit?: number) {
    return this.categoriesService.getTopCategories(limit)
  }

  @ApiOperation({ summary: "Get category by ID" })
  @ApiResponse({ status: 200, description: "Category retrieved successfully" })
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.categoriesService.findOne(id)
  }

  @ApiOperation({ summary: "Update category" })
  @ApiResponse({ status: 200, description: "Category updated successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "admin", "manager", "pharmacist")
  @Patch(":id")
  update(@Param("id") id: string, updateCategoryDto: UpdateCategoryDto) {
    return this.categoriesService.update(id, updateCategoryDto)
  }

  @ApiOperation({ summary: "Delete category" })
  @ApiResponse({ status: 200, description: "Category deleted successfully" })
  @UseGuards(RolesGuard)
  @Roles("super_admin", "admin", "manager")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.categoriesService.remove(id)
  }
}
