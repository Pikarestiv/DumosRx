import { ApiProperty } from "@nestjs/swagger"
import { IsNotEmpty, IsOptional, IsUUID } from "class-validator"

export class CreateCategoryDto {
  @ApiProperty({ example: "Analgesics" })
  @IsNotEmpty()
  name: string

  @ApiProperty({ example: "Pain relief medications", required: false })
  @IsOptional()
  description?: string

  @ApiProperty({ example: "uuid-of-parent-category", required: false })
  @IsOptional()
  @IsUUID()
  parent_id?: string
}
