import { ApiProperty } from "@nestjs/swagger"
import { IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsUUID, Min } from "class-validator"

export class CreateMedicineDto {
  @ApiProperty({ example: "Paracetamol Tablets" })
  @IsNotEmpty()
  name: string

  @ApiProperty({ example: "Paracetamol", required: false })
  @IsOptional()
  generic_name?: string

  @ApiProperty({ example: "Panadol", required: false })
  @IsOptional()
  brand_name?: string

  @ApiProperty({ example: "uuid-of-category" })
  @IsUUID()
  category_id: string

  @ApiProperty({ example: "Emzor Pharmaceutical Industries" })
  @IsNotEmpty()
  manufacturer: string

  @ApiProperty({ example: "uuid-of-supplier", required: false })
  @IsOptional()
  @IsUUID()
  supplier_id?: string

  @ApiProperty({ example: "NAFDAC-12345678", required: false })
  @IsOptional()
  nafdac_number?: string

  @ApiProperty({ example: "tablet" })
  @IsNotEmpty()
  dosage_form: string

  @ApiProperty({ example: "500mg" })
  @IsNotEmpty()
  strength: string

  @ApiProperty({ example: 20, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  pack_size?: number

  @ApiProperty({ example: "piece", required: false })
  @IsOptional()
  unit_of_measure?: string

  @ApiProperty({ example: "Pain relief medication", required: false })
  @IsOptional()
  description?: string

  @ApiProperty({ example: "Headache, fever, pain relief", required: false })
  @IsOptional()
  indications?: string

  @ApiProperty({ example: "Liver disease, alcohol dependency", required: false })
  @IsOptional()
  contraindications?: string

  @ApiProperty({ example: "Nausea, skin rash", required: false })
  @IsOptional()
  side_effects?: string

  @ApiProperty({ example: "Store in cool, dry place", required: false })
  @IsOptional()
  storage_conditions?: string

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  requires_prescription?: boolean

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  is_controlled?: boolean

  @ApiProperty({ example: 150.0, required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cost_price?: number

  @ApiProperty({ example: 200.0, required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  selling_price?: number

  @ApiProperty({ example: "1234567890123", required: false })
  @IsOptional()
  barcode?: string
}
