import { Module } from "@nestjs/common"
import { InventoryService } from "./inventory.service"
import { InventoryController } from "./inventory.controller"
import { StockMovementsService } from "./stock-movements.service"
import { StockMovementsController } from "./stock-movements.controller"
import { PurchaseOrdersService } from "./purchase-orders.service"
import { PurchaseOrdersController } from "./purchase-orders.controller"
import { SuppliersService } from "./suppliers.service"
import { SuppliersController } from "./suppliers.controller"

@Module({
  providers: [InventoryService, StockMovementsService, PurchaseOrdersService, SuppliersService],
  controllers: [InventoryController, StockMovementsController, PurchaseOrdersController, SuppliersController],
  exports: [InventoryService, StockMovementsService, PurchaseOrdersService, SuppliersService],
})
export class InventoryModule {}
