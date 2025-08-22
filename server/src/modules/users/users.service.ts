import { Injectable, NotFoundException } from "@nestjs/common"
import { SupabaseService } from "../supabase/supabase.service"

export interface CreateUserDto {
  email: string
  password_hash: string
  first_name: string
  last_name: string
  phone?: string
  role: string
}

@Injectable()
export class UsersService {
  constructor(private supabaseService: SupabaseService) {}

  async create(createUserDto: CreateUserDto) {
    const { data, error } = await this.supabaseService.db.from("users").insert([createUserDto]).select().single()

    if (error) {
      throw new Error(`Failed to create user: ${error.message}`)
    }

    return data
  }

  async findByEmail(email: string) {
    const { data, error } = await this.supabaseService.db.from("users").select("*").eq("email", email).single()

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find user: ${error.message}`)
    }

    return data
  }

  async findById(id: string) {
    const { data, error } = await this.supabaseService.db.from("users").select("*").eq("id", id).single()

    if (error) {
      if (error.code === "PGRST116") {
        throw new NotFoundException("User not found")
      }
      throw new Error(`Failed to find user: ${error.message}`)
    }

    return data
  }

  async findAll() {
    const { data, error } = await this.supabaseService.db
      .from("users")
      .select("id, email, first_name, last_name, phone, role, is_active, last_login, created_at")
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch users: ${error.message}`)
    }

    return data
  }

  async updateLastLogin(id: string) {
    const { error } = await this.supabaseService.db
      .from("users")
      .update({ last_login: new Date().toISOString() })
      .eq("id", id)

    if (error) {
      throw new Error(`Failed to update last login: ${error.message}`)
    }
  }

  async updatePassword(id: string, passwordHash: string) {
    const { error } = await this.supabaseService.db.from("users").update({ password_hash: passwordHash }).eq("id", id)

    if (error) {
      throw new Error(`Failed to update password: ${error.message}`)
    }
  }

  async deactivateUser(id: string) {
    const { error } = await this.supabaseService.db.from("users").update({ is_active: false }).eq("id", id)

    if (error) {
      throw new Error(`Failed to deactivate user: ${error.message}`)
    }
  }

  async activateUser(id: string) {
    const { error } = await this.supabaseService.db.from("users").update({ is_active: true }).eq("id", id)

    if (error) {
      throw new Error(`Failed to activate user: ${error.message}`)
    }
  }
}
