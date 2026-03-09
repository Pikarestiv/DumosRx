import { LoginForm } from "@/components/auth/login-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { APP_NAME } from "@/lib/constants"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-serif font-black text-3xl text-foreground mb-2">{APP_NAME}</h1>
          <p className="text-muted-foreground">NextGen Retail & Pharmacy Management System</p>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="font-serif font-bold text-2xl text-center">Sign In</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access your business dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>Trusted by 2000+ Nigerian businesses</p>
          <p className="mt-1">Compliant • Secure • Reliable</p>
          <p className="mt-3 text-xs">
            Built by{" "}
            <a
              href="https://dumostech.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              Dumos Technologies
            </a>
          </p>
          <p className="text-xs opacity-75">© 2019 - 2025</p>
        </div>
      </div>
    </div>
  )
}
