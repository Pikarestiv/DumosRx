"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, Shield, User } from "lucide-react"

type UserRole = "super_admin" | "manager" | "pharmacist" | "sales_staff" | "auditor"

interface LoginFormData {
  email: string
  password: string
  role: UserRole | ""
}

export function LoginForm() {
  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
    role: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    // Basic validation
    if (!formData.email || !formData.password || !formData.role) {
      setError("Please fill in all fields")
      setIsLoading(false)
      return
    }

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // For demo purposes, redirect to dashboard
      console.log("[v0] Login attempt:", formData)
      window.location.href = "/dashboard"
    } catch (err) {
      setError("Invalid credentials. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const roleOptions = [
    { value: "super_admin", label: "Super Administrator", icon: Shield },
    { value: "manager", label: "Manager", icon: User },
    { value: "pharmacist", label: "Pharmacist", icon: User },
    { value: "sales_staff", label: "Sales Staff", icon: User },
    { value: "auditor", label: "Auditor", icon: User },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <Input
          id="email"
          type="email"
          placeholder="Enter your email"
          value={formData.email}
          onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
          className="bg-input border-border focus:ring-accent"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            value={formData.password}
            onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
            className="bg-input border-border focus:ring-accent pr-10"
            required
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">User Role</Label>
        <Select
          value={formData.role}
          onValueChange={(value: UserRole) => setFormData((prev) => ({ ...prev, role: value }))}
        >
          <SelectTrigger className="bg-input border-border focus:ring-accent">
            <SelectValue placeholder="Select your role" />
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center gap-2">
                  <option.icon className="h-4 w-4" />
                  {option.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="submit"
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
        disabled={isLoading}
      >
        {isLoading ? "Signing In..." : "Sign In"}
      </Button>

      <div className="text-center">
        <Button variant="link" className="text-accent hover:text-accent/80 text-sm">
          Forgot your password?
        </Button>
      </div>
    </form>
  )
}
