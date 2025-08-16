import { ApiProperty } from "@nestjs/swagger"
import { IsOptional, IsDateString, IsUUID, IsEnum } from "class-validator"
import { PaymentMethod } from "./create-sale.dto"

export class SalesReportDto {
  @ApiProperty({ example: "2024-01-01", required: false })
  @IsOptional()
  @IsDateString()
  start_date?: string

  @ApiProperty({ example: "2024-01-31", required: false })
  @IsOptional()
  @IsDateString()
  end_date?: string

  @ApiProperty({ example: "uuid-of-cashier", required: false })
  @IsOptional()
  @IsUUID()
  cashier_id?: string

  @ApiProperty({ enum: PaymentMethod, required: false })
  @IsOptional()
  @IsEnum(PaymentMethod)
  payment_method?: PaymentMethod
}
