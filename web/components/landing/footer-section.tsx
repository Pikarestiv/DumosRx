import Image from "next/image";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export function FooterSection() {
  return (
    <footer className="bg-background border-t py-12">
      <div className="container px-4 mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2">
            <Link href="/" className="flex items-center mb-6">
              <Image
                src="/logo.png"
                alt="DumosRx Logo"
                width={120}
                height={38}
                className="h-8 w-auto object-contain brightness-0 invert"
              />
            </Link>
            <p className="text-muted-foreground max-w-xs mb-6">
              The most reliable pharmacy management system for the Nigerian
              market. Offline-first, cloud-synced, and built for growth.
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-4 uppercase text-xs tracking-widest text-muted-foreground">
              Product
            </h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="#features"
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="#pricing"
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/downloads"
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Downloads
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 uppercase text-xs tracking-widest text-muted-foreground">
              Company
            </h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Privacy
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <Separator className="mb-8" />
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>
            © {new Date().getFullYear()} Dumos Technologies. All rights
            reserved.
          </p>
          <div className="flex gap-6">
            <Link href="#" className="hover:text-primary">
              Twitter
            </Link>
            <Link href="#" className="hover:text-primary">
              LinkedIn
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
