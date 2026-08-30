"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

function useIsTouchDevice() {
  const [isTouch, setIsTouch] = React.useState(false)
  React.useEffect(() => {
    setIsTouch(window.matchMedia("(hover: none)").matches)
  }, [])
  return isTouch
}

interface TooltipContextValue {
  isTouch: boolean
  open: boolean
  setOpen: (open: boolean) => void
}
const TooltipContext = React.createContext<TooltipContextValue | null>(null)

/** Radix's hover/focus-based trigger doesn't respond to touch, so on
 * touch devices this manages its own controlled `open` state and lets
 * TooltipTrigger toggle it on tap instead. */
function Tooltip({
  open: openProp,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) {
  const isTouch = useIsTouchDevice()
  const [openState, setOpenState] = React.useState(false)
  const open = openProp ?? openState

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  if (!isTouch) {
    return <TooltipPrimitive.Root open={openProp} onOpenChange={onOpenChange} {...props} />
  }

  return (
    <TooltipContext.Provider value={{ isTouch, open, setOpen }}>
      <TooltipPrimitive.Root open={open} onOpenChange={setOpen} {...props} />
    </TooltipContext.Provider>
  )
}

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ onClick, ...props }, ref) => {
  const ctx = React.useContext(TooltipContext)

  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      onClick={(e) => {
        onClick?.(e)
        if (ctx) {
          e.preventDefault()
          ctx.setOpen(!ctx.open)
        }
      }}
      {...props}
    />
  )
})
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-[200px] overflow-hidden rounded-md bg-background/95 backdrop-blur-sm border shadow-sm px-3 py-1.5 text-xs text-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
