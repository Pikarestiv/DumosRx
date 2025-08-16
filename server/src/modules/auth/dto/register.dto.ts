import { ApiProperty } from "@nestjs/swagger"
import { IsEmail, IsNotEmpty, MinLength, IsEnum, IsOptional, IsPhoneNumber } from "class-validator"

export enum UserRole {
  SUPER_ADMIN = "super_admin",
  MANAGER = "manager",
  PHARMACIST = "pharmacist",
  SALES_STAFF = "sales_staff",
  AUDITOR = "auditor",
}

export class RegisterDto {
  @ApiProperty({ example: "john.doe@dumosrx.com" })
  @IsEmail()
  @IsNotEmpty()
  email: string

  @ApiProperty({ example: "password123" })
  @IsNotEmpty()
  @MinLength(6)
  password: string

  @ApiProperty({ example: "John" })
  @IsNotEmpty()
  first_name: string

  @ApiProperty({ example: "Doe" })
  @IsNotEmpty()
  last_name: string

  @ApiProperty({ example: "+234-801-234-5678", required: false })
  @IsOptional()
  @IsPhoneNumber("NG")
  phone?: string

  @ApiProperty({ enum: UserRole, example: UserRole.PHARMACIST })
  @IsEnum(UserRole)
  role: UserRole
}
