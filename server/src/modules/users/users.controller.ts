import { Controller, Get, Param, Patch, UseGuards } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger"
import type { UsersService } from "./users.service"
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { RolesGuard } from "../auth/guards/roles.guard"
import { Roles } from "../auth/decorators/roles.decorator"

@ApiTags("Users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  constructor(private usersService: UsersService) {}

  @ApiOperation({ summary: "Get all users" })
  @ApiResponse({ status: 200, description: "Users retrieved successfully" })
  @Roles("super_admin", "manager")
  @Get()
  async findAll() {
    return this.usersService.findAll()
  }

  @ApiOperation({ summary: "Get user by ID" })
  @ApiResponse({ status: 200, description: "User retrieved successfully" })
  @Roles("super_admin", "manager")
  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.usersService.findById(id)
  }

  @ApiOperation({ summary: "Deactivate user" })
  @ApiResponse({ status: 200, description: "User deactivated successfully" })
  @Roles("super_admin", "manager")
  @Patch(":id/deactivate")
  async deactivate(@Param("id") id: string) {
    await this.usersService.deactivateUser(id)
    return { message: "User deactivated successfully" }
  }

  @ApiOperation({ summary: "Activate user" })
  @ApiResponse({ status: 200, description: "User activated successfully" })
  @Roles("super_admin", "manager")
  @Patch(":id/activate")
  async activate(@Param("id") id: string) {
    await this.usersService.activateUser(id)
    return { message: "User activated successfully" }
  }
}
