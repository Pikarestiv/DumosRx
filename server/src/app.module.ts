import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { AuthModule } from "./modules/auth/auth.module"
import { UsersModule } from "./modules/users/users.module"
import { MedicinesModule } from "./modules/medicines/medicines.module"
import { InventoryModule } from "./modules/inventory/inventory.module"
import { SalesModule } from "./modules/sales/sales.module"
import { PrescriptionsModule } from "./modules/prescriptions/prescriptions.module"
import { CustomersModule } from "./modules/customers/customers.module"
import { AnalyticsModule } from "./modules/analytics/analytics.module"
import { SupabaseModule } from "./modules/supabase/supabase.module"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    SupabaseModule,
    AuthModule,
    UsersModule,
    MedicinesModule,
    InventoryModule,
    SalesModule,
    PrescriptionsModule,
    CustomersModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
