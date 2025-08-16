import { ApiProperty } from "@nestjs/swagger"
import { IsNotEmpty, IsNumber, IsUUID, IsOptional, IsDateString, Min } from "class-validator"

export class CreateInventoryDto {
  @ApiProperty({ example: "uuid-of-medicine" })
  @IsUUID()
  @IsNotEmpty()
  medicine_id: string

  @ApiProperty({ example: "BATCH001" })
  @IsNotEmpty()
  batch_number: string

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  quantity_in_stock: number

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorder_level?: number

  @ApiProperty({ example: 1000, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  max_stock_level?: number

  @ApiProperty({ example: 150.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cost_price: number

  @ApiProperty({ example: 200.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  selling_price: number

  @ApiProperty({ example: "2024-01-15", required: false })
  @IsOptional()
  @IsDateString()
  manufacture_date?: string

  @ApiProperty({ example: "2026-01-15" })
  @IsDateString()
  expiry_date: string

  @ApiProperty({ example: "uuid-of-supplier", required: false })
  @IsOptional()
  @IsUUID()
  supplier_id?: string

  @ApiProperty({ example: "A1-B2", required: false })
  @IsOptional()
  location?: string
}
