import { Module } from "@nestjs/common"
import { SalesService } from "./sales.service"
import { SalesController } from "./sales.controller"
import { CustomersModule } from "../customers/customers.module"
import { InventoryModule } from "../inventory/inventory.module"
import { PrescriptionsModule } from "../prescriptions/prescriptions.module"

@Module({
  imports: [CustomersModule, InventoryModule, PrescriptionsModule],
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}
