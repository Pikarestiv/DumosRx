import { ApiProperty } from "@nestjs/swagger"
import { IsNotEmpty, MinLength } from "class-validator"

export class ChangePasswordDto {
  @ApiProperty({ example: "currentPassword123" })
  @IsNotEmpty()
  currentPassword: string

  @ApiProperty({ example: "newPassword123" })
  @IsNotEmpty()
  @MinLength(6)
  newPassword: string
}
