import { RecentUser } from "@/lib/context/auth-context";
import { getUserInitials, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { UserRoundPlus } from "lucide-react";

interface UserSelectionProps {
  recentUsers: RecentUser[];
  onSelectUser: (user: RecentUser) => void;
  onLoginAsOther: () => void;
}

// Deterministic per-user accent so avatars aren't all the same flat primary
// tint — cycles through a small curated set rather than hashing to anything
// unbounded, so the palette stays on-brand.
const AVATAR_ACCENTS = [
  "from-primary/25 to-primary/5 text-primary ring-primary/20",
  "from-violet-500/25 to-violet-500/5 text-violet-600 dark:text-violet-400 ring-violet-500/20",
  "from-amber-500/25 to-amber-500/5 text-amber-600 dark:text-amber-400 ring-amber-500/20",
  "from-emerald-500/25 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  "from-rose-500/25 to-rose-500/5 text-rose-600 dark:text-rose-400 ring-rose-500/20",
  "from-sky-500/25 to-sky-500/5 text-sky-600 dark:text-sky-400 ring-sky-500/20",
];

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1 },
};

export function UserSelection({
  recentUsers,
  onSelectUser,
  onLoginAsOther,
}: UserSelectionProps) {
  const isSingle = recentUsers.length === 1;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col justify-between sm:justify-start space-y-4 sm:space-y-6"
    >
      <div className="text-center space-y-1.5 pb-2 pt-4 sm:pt-0">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Welcome Back
        </h2>
        <p className="text-sm text-muted-foreground font-medium">
          {isSingle
            ? "Select your account to continue"
            : "Who's using the register?"}
        </p>
      </div>

      <div className="flex-1 flex flex-col justify-center sm:block">
        <motion.div
          variants={listVariants}
          initial="hidden"
          animate="show"
          className={cn(
            "grid gap-3 sm:gap-4 w-full",
            isSingle
              ? "grid-cols-1 max-w-[320px] sm:max-w-[360px] mx-auto"
              : "grid-cols-2",
          )}
        >
          {recentUsers.map((user, idx) => {
            const accent = AVATAR_ACCENTS[idx % AVATAR_ACCENTS.length];
            return (
              <motion.button
                key={user.id}
                variants={cardVariants}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelectUser(user)}
                className={cn(
                  "group relative flex h-auto flex-col items-center justify-center overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/60 text-center shadow-sm backdrop-blur-sm transition-colors duration-300 hover:border-primary/40 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2",
                  isSingle ? "p-8 sm:p-10 gap-4 sm:gap-6" : "p-4 sm:p-5 gap-2 sm:gap-3",
                )}
              >
                {/* Soft radial glow that fades in on hover/focus */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                <Avatar
                  className={cn(
                    "relative shadow-sm ring-2 transition-transform duration-300 group-hover:scale-105 bg-gradient-to-br",
                    accent,
                    isSingle ? "h-20 w-20 sm:h-24 sm:w-24" : "h-12 w-12 sm:h-14 sm:w-14",
                  )}
                >
                  <AvatarFallback
                    className={cn(
                      "bg-transparent font-semibold",
                      isSingle ? "text-2xl sm:text-3xl" : "text-base sm:text-lg",
                    )}
                  >
                    {getUserInitials(user.first_name, user.last_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="relative w-full space-y-1">
                  <p
                    className={cn(
                      "truncate font-semibold text-foreground group-hover:text-primary transition-colors",
                      isSingle ? "text-lg sm:text-xl" : "text-sm",
                    )}
                  >
                    {user.first_name} {user.last_name}
                  </p>
                  <p
                    className={cn(
                      "truncate font-medium text-muted-foreground capitalize",
                      isSingle ? "text-sm sm:text-base" : "text-xs",
                    )}
                  >
                    {user.role.replace(/_/g, " ")}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      <div className="pt-4 sm:pt-6 pb-2 sm:pb-0 flex justify-center">
        <button
          className="group inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          onClick={onLoginAsOther}
        >
          <UserRoundPlus className="h-3.5 w-3.5 opacity-70 transition-opacity group-hover:opacity-100" />
          Log in as someone else
        </button>
      </div>
    </motion.div>
  );
}
