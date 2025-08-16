import { ApiProperty } from "@nestjs/swagger"
import { IsNumber, IsNotEmpty } from "class-validator"

export class StockAdjustmentDto {
  @ApiProperty({ example: 10, description: "Positive for increase, negative for decrease" })
  @IsNumber()
  quantity_change: number

  @ApiProperty({ example: "Stock count correction" })
  @IsNotEmpty()
  reason: string
}
