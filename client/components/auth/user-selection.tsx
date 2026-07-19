import { RecentUser } from "@/lib/context/auth-context";
import { getUserInitials, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { motion } from "framer-motion";

interface UserSelectionProps {
  recentUsers: RecentUser[];
  onSelectUser: (user: RecentUser) => void;
  onLoginAsOther: () => void;
}

export function UserSelection({
  recentUsers,
  onSelectUser,
  onLoginAsOther,
}: UserSelectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col justify-between sm:justify-start space-y-4 sm:space-y-6"
    >
      <div className="text-center space-y-1 pb-2 pt-4 sm:pt-0">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Welcome Back
        </h2>
        <p className="text-sm text-muted-foreground font-medium">
          Select an account to access the register
        </p>
      </div>

      <div className="flex-1 flex flex-col justify-center sm:block">
        <div
          className={cn(
            "grid gap-3 sm:gap-4 w-full",
            recentUsers.length === 1
              ? "grid-cols-1 max-w-[320px] sm:max-w-[360px] mx-auto"
              : "grid-cols-2",
          )}
        >
          {recentUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => onSelectUser(user)}
              className={cn(
                "group relative flex h-auto flex-col items-center justify-center rounded-2xl border border-border/50 bg-card text-center shadow-sm transition-all duration-300 hover:border-primary/40 hover:bg-primary/5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2",
                recentUsers.length === 1 
                  ? "p-8 sm:p-10 gap-4 sm:gap-6" 
                  : "p-4 sm:p-5 gap-2 sm:gap-3"
              )}
            >
              <Avatar 
                className={cn(
                  "shadow-sm transition-transform duration-300 group-hover:scale-105 group-hover:shadow-md",
                  recentUsers.length === 1 
                    ? "h-20 w-20 sm:h-24 sm:w-24" 
                    : "h-12 w-12 sm:h-14 sm:w-14"
                )}
              >
                <AvatarFallback 
                  className={cn(
                    "bg-primary/10 text-primary font-medium",
                    recentUsers.length === 1 ? "text-2xl sm:text-3xl" : "text-base sm:text-lg"
                  )}
                >
                  {getUserInitials(user.first_name, user.last_name)}
                </AvatarFallback>
              </Avatar>
              <div className="w-full space-y-1">
                <p 
                  className={cn(
                    "truncate font-semibold text-foreground group-hover:text-primary transition-colors",
                    recentUsers.length === 1 ? "text-lg sm:text-xl" : "text-sm"
                  )}
                >
                  {user.first_name} {user.last_name}
                </p>
                <p 
                  className={cn(
                    "truncate font-medium text-muted-foreground capitalize",
                    recentUsers.length === 1 ? "text-sm sm:text-base" : "text-xs"
                  )}
                >
                  {user.role.replace(/_/g, " ")}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 sm:pt-6 pb-2 sm:pb-0 flex justify-center">
        <button
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={onLoginAsOther}
        >
          Log in as someone else
        </button>
      </div>
    </motion.div>
  );
}
