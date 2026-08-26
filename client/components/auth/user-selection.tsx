import { useEffect, useState } from "react";
import { RecentUser } from "@/lib/context/auth-context";
import { getUserInitials, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

interface UserSelectionProps {
  recentUsers: RecentUser[];
  onSelectUser: (user: RecentUser) => void;
  onLoginAsOther: () => void;
}

// Deterministic per-user accent so avatars aren't all the same flat primary
// tint. Cycles through a small curated set rather than hashing to anything
// unbounded, so the palette stays on-brand.
const AVATAR_ACCENTS = [
  {
    ring: "group-hover:ring-primary/40 group-focus-visible:ring-primary/40",
    glow: "bg-primary/30",
    text: "text-primary",
  },
  {
    ring: "group-hover:ring-violet-500/40 group-focus-visible:ring-violet-500/40",
    glow: "bg-violet-500/30",
    text: "text-violet-600 dark:text-violet-400",
  },
  {
    ring: "group-hover:ring-amber-500/40 group-focus-visible:ring-amber-500/40",
    glow: "bg-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
  },
  {
    ring: "group-hover:ring-emerald-500/40 group-focus-visible:ring-emerald-500/40",
    glow: "bg-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  {
    ring: "group-hover:ring-rose-500/40 group-focus-visible:ring-rose-500/40",
    glow: "bg-rose-500/30",
    text: "text-rose-600 dark:text-rose-400",
  },
  {
    ring: "group-hover:ring-sky-500/40 group-focus-visible:ring-sky-500/40",
    glow: "bg-sky-500/30",
    text: "text-sky-600 dark:text-sky-400",
  },
];

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

const tileVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.9 },
  show: { opacity: 1, y: 0, scale: 1 },
};

// Netflix/Apple-TV-style profile picker: floating avatar + label, no card
// chrome, colored glow bloom behind each avatar on hover. Chosen over a
// bordered-card grid because the previous design read as "the same" at a
// glance. This reads unmistakably different even in a quick screenshot.
export function UserSelection({
  recentUsers,
  onSelectUser,
  onLoginAsOther,
}: UserSelectionProps) {
  // Determined client-side only (defaults to the Windows/Linux label on
  // first render) to avoid a hydration mismatch: navigator isn't available
  // during SSR.
  const [lockShortcutLabel, setLockShortcutLabel] = useState("Ctrl+L");
  useEffect(() => {
    if (navigator.userAgent.includes("Mac")) {
      setLockShortcutLabel("⌘L");
    }
  }, []);

  const isSingle = recentUsers.length === 1;
  const avatarSize = isSingle
    ? "h-28 w-28 sm:h-32 sm:w-32"
    : "h-20 w-20 sm:h-24 sm:w-24";
  // Tile width must be >= the avatar's own width at every breakpoint. A
  // narrower fixed tile (there used to be a flat w-24 here regardless of
  // avatarSize) lets the circle overflow its own slot, silently eating into
  // whatever gap-x is set and, worse, compounding with the hover scale below
  // until neighboring tiles visibly overlap.
  const tileWidth = isSingle ? "w-28 sm:w-32" : "w-20 sm:w-24";

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col justify-between sm:justify-start space-y-6 sm:space-y-8"
    >
      <div className="text-center space-y-1.5 pb-1 pt-4 sm:pt-0">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Welcome Back
        </h2>
        <p className="text-sm text-muted-foreground font-medium">
          {isSingle ? "Select your profile to continue" : "Who's clocking in?"}
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground/60">
        Tip: press{" "}
        <kbd className="rounded border border-muted-foreground/30 bg-muted/50 px-1.5 py-0.5 font-mono">
          {lockShortcutLabel}
        </kbd>{" "}
        anytime to lock the app instantly.
      </p>

      <div className="flex-1 flex flex-col justify-center sm:block">
        <motion.div
          variants={listVariants}
          initial="hidden"
          animate="show"
          // Grid, not flex-wrap: flex-wrap re-centers each wrapped row
          // independently, so a trailing row with just one or two tiles (e.g.
          // 3 users + the "Someone else" tile) ends up visually orphaned with
          // a big centered gap under it. A fixed-column grid keeps every row
          // left-aligned to the same columns instead. The single-user case
          // has only two tiles total (them + "someone else"), so it stays a
          // simple centered row rather than a mostly-empty 3-column grid.
          className={cn(
            isSingle
              ? "flex justify-center gap-x-8"
              : "grid grid-cols-3 justify-items-center gap-x-3 gap-y-6 sm:gap-x-4",
          )}
        >
          {recentUsers.map((user, idx) => {
            const accent = AVATAR_ACCENTS[idx % AVATAR_ACCENTS.length];
            return (
              <motion.button
                key={user.id}
                variants={tileVariants}
                whileTap={{ scale: 0.94 }}
                onClick={() => onSelectUser(user)}
                className={cn(
                  "group flex flex-col items-center gap-3 focus:outline-none",
                  tileWidth,
                )}
              >
                <div className="relative flex items-center justify-center">
                  <div
                    className={cn(
                      "absolute inset-0 scale-90 rounded-full blur-xl opacity-0 transition-all duration-300 group-hover:scale-110 group-hover:opacity-100 group-focus-visible:scale-110 group-focus-visible:opacity-100",
                      accent.glow,
                    )}
                  />
                  <Avatar
                    className={cn(
                      "relative shadow-[0_2px_10px_rgba(0,0,0,0.1),0_-1px_3px_rgba(0,0,0,0.04)] ring-2 ring-black/5 dark:ring-white/10 transition-all duration-300 group-hover:scale-105 group-hover:ring-4 group-focus-visible:scale-105 group-focus-visible:ring-4 bg-card",
                      accent.ring,
                      avatarSize,
                    )}
                  >
                    <AvatarFallback
                      className={cn(
                        "bg-muted/60 font-bold",
                        accent.text,
                        isSingle
                          ? "text-3xl sm:text-4xl"
                          : "text-xl sm:text-2xl",
                      )}
                    >
                      {getUserInitials(user.first_name, user.last_name)}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="w-full space-y-1 text-center">
                  <p className="truncate text-sm font-semibold text-foreground/80 transition-colors group-hover:text-foreground">
                    {user.first_name}
                  </p>
                  <span
                    className={cn(
                      "inline-block truncate rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground",
                    )}
                  >
                    {user.role.replace(/_/g, " ")}
                  </span>
                </div>
              </motion.button>
            );
          })}

          <motion.button
            variants={tileVariants}
            whileTap={{ scale: 0.94 }}
            onClick={onLoginAsOther}
            className={cn(
              "group flex flex-col items-center gap-3 focus:outline-none",
              tileWidth,
            )}
          >
            <div
              className={cn(
                "flex items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 text-muted-foreground/50 transition-all duration-300 group-hover:scale-105 group-hover:border-primary/50 group-hover:text-primary group-focus-visible:scale-105 group-focus-visible:border-primary/50 group-focus-visible:text-primary",
                avatarSize,
              )}
            >
              <Plus className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <p className="text-sm font-medium text-muted-foreground/70 transition-colors group-hover:text-foreground">
              Someone else
            </p>
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
}
