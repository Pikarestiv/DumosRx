"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";

export function FooterSection() {
  const [socialLinks, setSocialLinks] = useState<any>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/system-configs/social_links`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const val = typeof data.data === "string" ? JSON.parse(data.data) : data.data;
          setSocialLinks(val);
        }
      })
      .catch((err) => console.error("Failed to load social links", err));
  }, []);

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
                className="h-8 w-auto object-contain"
                style={{ filter: "var(--logo-filter)" }}
              />
            </Link>
            <p className="text-muted-foreground max-w-xs mb-6">
              The most reliable store management system for the Nigerian
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
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Terms & Conditions
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
            {socialLinks && socialLinks.active_links?.twitter !== false && socialLinks.twitter && (
              <a href={socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="hover:text-primary capitalize">
                Twitter
              </a>
            )}
            {socialLinks && socialLinks.active_links?.linkedin !== false && socialLinks.linkedin && (
              <a href={socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-primary capitalize">
                LinkedIn
              </a>
            )}
            {socialLinks && socialLinks.active_links?.facebook !== false && socialLinks.facebook && (
              <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-primary capitalize">
                Facebook
              </a>
            )}
            {socialLinks && socialLinks.active_links?.github !== false && socialLinks.github && (
              <a href={socialLinks.github} target="_blank" rel="noopener noreferrer" className="hover:text-primary capitalize">
                GitHub
              </a>
            )}
            {socialLinks && socialLinks.active_links?.instagram !== false && socialLinks.instagram && (
              <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-primary capitalize">
                Instagram
              </a>
            )}
            {!socialLinks && (
              <>
                <Link href="#" className="hover:text-primary">Twitter</Link>
                <Link href="#" className="hover:text-primary">LinkedIn</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
