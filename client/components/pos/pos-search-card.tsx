"use client";

import { Search, Scan, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import React from "react";

interface POSSearchCardProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  completedTransaction: any;
  setShowReceiptDialog: (show: boolean) => void;
  productTerm: string;
}

export function POSSearchCard({
  searchTerm,
  onSearchChange,
  onKeyDown,
  searchInputRef,
  completedTransaction,
  setShowReceiptDialog,
  productTerm
}: POSSearchCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold flex items-center gap-2">
          <Search className="h-5 w-5" />
          {productTerm} Search
        </CardTitle>
        <CardDescription>
          Search by name, brand, or scan barcode
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder={`Search ${productTerm.toLowerCase()}s or scan barcode...`}
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={onKeyDown}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            className="flex items-center gap-2 bg-transparent cursor-pointer"
            onClick={() => toast.info("Camera scanner coming soon! Keyboard scanners work in the search box.")}
          >
            <Scan className="h-4 w-4" />
            Scan
          </Button>
          {completedTransaction && (
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowReceiptDialog(true)}
            >
              <Receipt className="h-4 w-4" />
              Last Receipt
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
