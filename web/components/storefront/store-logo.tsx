import { cn } from "@/lib/utils";

interface StoreLogoProps {
  name: string;
  logo?: string | null;
  className?: string;
}

export function StoreLogo({ name, logo, className }: StoreLogoProps) {
  const shape = "h-10 w-10 shrink-0 rounded-[var(--sf-button-radius)]";

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static export arbitrary data URI
      <img src={logo} alt="" className={cn(shape, "object-contain", className)} />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        shape,
        "flex items-center justify-center border text-lg font-extrabold [background:var(--sf-add-bg)] [border-color:var(--sf-add-border)] [color:var(--sf-add-fg)]",
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "S"}
    </span>
  );
}
