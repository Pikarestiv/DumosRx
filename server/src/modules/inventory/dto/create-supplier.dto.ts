import { ApiProperty } from "@nestjs/swagger"
import { IsNotEmpty, IsOptional, IsEmail, IsNumber, Min, Max } from "class-validator"

export class CreateSupplierDto {
  @ApiProperty({ example: "Emzor Pharmaceutical Industries" })
  @IsNotEmpty()
  name: string

  @ApiProperty({ example: "John Doe", required: false })
  @IsOptional()
  contact_person?: string

  @ApiProperty({ example: "contact@emzor.com", required: false })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiProperty({ example: "+234-1-234-5678", required: false })
  @IsOptional()
  phone?: string

  @ApiProperty({ example: "123 Industrial Avenue, Ikeja", required: false })
  @IsOptional()
  address?: string

  @ApiProperty({ example: "Lagos", required: false })
  @IsOptional()
  city?: string

  @ApiProperty({ example: "Lagos", required: false })
  @IsOptional()
  state?: string

  @ApiProperty({ example: "Nigeria", required: false })
  @IsOptional()
  country?: string

  @ApiProperty({ example: "12345678", required: false })
  @IsOptional()
  tax_id?: string

  @ApiProperty({ example: 30, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  payment_terms?: number

  @ApiProperty({ example: 4.5, required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  rating?: number
}
