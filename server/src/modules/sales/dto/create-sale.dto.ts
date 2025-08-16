import { ApiProperty } from "@nestjs/swagger"
import { IsNumber, IsOptional, IsUUID, IsEnum, IsArray, ValidateNested, Min } from "class-validator"
import { Type } from "class-transformer"

export enum PaymentMethod {
  CASH = "cash",
  CARD = "card",
  TRANSFER = "transfer",
  MOBILE_MONEY = "mobile_money",
  INSURANCE = "insurance",
}

export class SaleItemDto {
  @ApiProperty({ example: "uuid-of-medicine" })
  @IsUUID()
  medicine_id: string

  @ApiProperty({ example: "uuid-of-inventory" })
  @IsUUID()
  inventory_id: string

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1)
  quantity: number

  @ApiProperty({ example: 200.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unit_price: number

  @ApiProperty({ example: 0.0, required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount_amount?: number

  @ApiProperty({ example: 400.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total_price: number

  @ApiProperty({ example: 150.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cost_price: number
}

export class CreateSaleDto {
  @ApiProperty({ example: "uuid-of-customer", required: false })
  @IsOptional()
  @IsUUID()
  customer_id?: string

  @ApiProperty({ example: "uuid-of-prescription", required: false })
  @IsOptional()
  @IsUUID()
  prescription_id?: string

  @ApiProperty({ example: 400.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  subtotal: number

  @ApiProperty({ example: 0.0, required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount_amount?: number

  @ApiProperty({ example: 0.0, required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount_percentage?: number

  @ApiProperty({ example: 30.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tax_amount: number

  @ApiProperty({ example: 7.5, required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tax_percentage?: number

  @ApiProperty({ example: 430.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total_amount: number

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  payment_method: PaymentMethod

  @ApiProperty({ example: 500.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount_paid: number

  @ApiProperty({ example: 70.0, required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  change_given?: number

  @ApiProperty({ example: 4, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  points_earned?: number

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  points_redeemed?: number

  @ApiProperty({ example: "Customer paid cash", required: false })
  @IsOptional()
  notes?: string

  @ApiProperty({ type: [SaleItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[]
}
