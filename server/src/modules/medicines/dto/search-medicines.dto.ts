import { ApiProperty } from "@nestjs/swagger"
import { IsOptional, IsNumber, IsBoolean, IsUUID, IsIn, Min, Max } from "class-validator"
import { Type } from "class-transformer"

export class SearchMedicinesDto {
  @ApiProperty({ required: false })
  @IsOptional()
  name?: string

  @ApiProperty({ required: false })
  @IsOptional()
  generic_name?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  category_id?: string

  @ApiProperty({ required: false })
  @IsOptional()
  manufacturer?: string

  @ApiProperty({ required: false })
  @IsOptional()
  nafdac_number?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  requires_prescription?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  is_controlled?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  min_price?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  max_price?: number

  @ApiProperty({ required: false, enum: ["name", "generic_name", "selling_price", "created_at"] })
  @IsOptional()
  @IsIn(["name", "generic_name", "selling_price", "created_at"])
  sort_by?: string

  @ApiProperty({ required: false, enum: ["asc", "desc"] })
  @IsOptional()
  @IsIn(["asc", "desc"])
  sort_order?: string

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number

  @ApiProperty({ required: false, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number
}
