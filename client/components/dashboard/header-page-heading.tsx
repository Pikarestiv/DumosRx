import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning,";
  if (hour === 12) return "Good noon,";
  if (hour < 17) return "Good afternoon,";
  return "Good evening,";
}

interface HeaderPageHeadingProps {
  pageInfo: { title: string; desc: string } | null;
  firstName?: string;
  lastName?: string;
}

/** Either a time-of-day greeting with the user's name (dashboard home), or
 * the current page's title with a tooltip for its description. */
export function HeaderPageHeading({ pageInfo, firstName, lastName }: HeaderPageHeadingProps) {
  if (!pageInfo) {
    return (
      <>
        <span className="text-foreground text-base sm:text-xl font-bold tracking-tight font-serif">
          {getGreeting()}
        </span>
        <span className="text-foreground text-base sm:text-xl font-bold hidden sm:inline-block tracking-tight font-serif truncate">
          {firstName} {lastName}
        </span>
        <span className="text-foreground text-base sm:text-xl font-bold sm:hidden tracking-tight font-serif truncate">
          {firstName}
        </span>
      </>
    );
  }

  if (!pageInfo.desc) {
    return (
      <span className="text-foreground text-base sm:text-xl font-bold tracking-tight font-serif">
        {pageInfo.title}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider delayDuration={1000}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-foreground text-base sm:text-xl font-bold tracking-tight cursor-default font-serif">
              {pageInfo.title}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-[300px] text-sm">
            <p>{pageInfo.desc}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
