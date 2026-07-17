import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";

export function SetupPromptHeader() {
  return (
    <>
      <CardTitle className="text-xl font-bold mt-2">
        No Local Accounts Found
      </CardTitle>
      <CardDescription className="text-muted-foreground mt-2">
        This device hasn't been set up yet. Would you like to create a
        new store or restore from a backup?
      </CardDescription>
    </>
  );
}

export function SetupPromptContent() {
  return (
    <CardContent className="flex flex-col space-y-3 pt-4 pb-6">
      <Link href="/setup?from=login">
        <Button className="w-full h-11 text-base font-bold shadow-lg">
          Setup New Store
        </Button>
      </Link>
      <Link href="/setup?step=backup&from=login">
        <Button
          variant="outline"
          className="w-full h-11 text-base font-bold"
        >
          Restore from Backup
        </Button>
      </Link>
      <div className="pt-2 text-center font-semibold text-xs text-muted-foreground">
        Already have a cloud account?{" "}
        <Link
          href="/setup?step=cloud&from=login"
          className="underline hover:text-primary transition-colors"
        >
          Sync Now
        </Link>
      </div>
    </CardContent>
  );
}
