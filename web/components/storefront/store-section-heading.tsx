interface StoreSectionHeadingProps {
  as?: "h1" | "h2";
  title: string;
  subtitle?: string | null;
}

export function StoreSectionHeading({ as: Tag = "h2", title, subtitle }: StoreSectionHeadingProps) {
  return (
    <div className="space-y-2">
      <Tag className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
        {title}
      </Tag>
      {subtitle && (
        <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
}
