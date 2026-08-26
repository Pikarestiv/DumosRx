/** Short label below md, full label at md+: the "abbreviate on mobile" pattern used across tab bars. */
export function ResponsiveTabLabel({
  short,
  long,
}: {
  short: React.ReactNode;
  long: React.ReactNode;
}) {
  return (
    <>
      <span className="md:hidden">{short}</span>
      <span className="hidden md:inline">{long}</span>
    </>
  );
}
