import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>("SUPABASE_URL")
    const supabaseServiceKey = this.configService.get<string>("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration is missing")
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  get client(): SupabaseClient {
    return this.supabase
  }

  // Helper method for database operations
  get db() {
    
    return this.supabase
  }
}
