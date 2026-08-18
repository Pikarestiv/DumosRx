import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";

export function SetupPromptHeader() {
  return (
    <>
      <CardTitle className="text-xl font-bold">
        No Local Accounts Found
      </CardTitle>
      <CardDescription className="text-muted-foreground">
        This device hasn't been set up yet. Would you like to create a new store
        or restore from a backup?
      </CardDescription>
    </>
  );
}

export function SetupPromptContent() {
  return (
    <CardContent className="flex flex-col space-y-3 p-0 mb-12 sm:mb-0">
      <Link href="/login?tab=setup&step=cloud">
        <Button className="w-full h-11 text-base font-bold shadow-lg">
          Restore from Cloud
        </Button>
      </Link>

      <Link href="/login?tab=setup">
        <Button
          variant="outline"
          className="w-full h-11 text-base font-bold hover:bg-primary/30"
        >
          Setup New Store
        </Button>
      </Link>
      <div className="pt-2 text-center font-semibold text-xs text-muted-foreground">
        Have a local backup file?{" "}
        <Link
          href="/login?tab=setup&step=backup"
          className="underline hover:text-primary transition-colors"
        >
          Restore Now
        </Link>
      </div>
    </CardContent>
  );
}
