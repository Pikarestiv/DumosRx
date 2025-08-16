import { Module } from "@nestjs/common"
import { MedicinesService } from "./medicines.service"
import { MedicinesController } from "./medicines.controller"
import { CategoriesService } from "./categories.service"
import { CategoriesController } from "./categories.controller"

@Module({
  providers: [MedicinesService, CategoriesService],
  controllers: [MedicinesController, CategoriesController],
  exports: [MedicinesService, CategoriesService],
})
export class MedicinesModule {}
