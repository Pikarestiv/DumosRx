"use client";

import React, { useEffect, useRef } from "react";
import { Html5QrcodeScanner, Html5QrcodeScanType } from "html5-qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CameraScannerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (barcode: string) => void;
}

export function CameraScannerDialog({
  isOpen,
  onClose,
  onScanSuccess,
}: CameraScannerDialogProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const readerId = React.useId().replace(/:/g, "");

  useEffect(() => {
    if (!isOpen) {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
      return;
    }

    // Use a small timeout to ensure the Dialog has fully mounted the DOM node
    const timer = setTimeout(() => {
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 150 },
        rememberLastUsedCamera: true,
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
      };

      const scanner = new Html5QrcodeScanner(`reader-${readerId}`, config, false);
      scannerRef.current = scanner;

      scanner.render(
        (decodedText) => {
          // Success callback
          scanner.clear().catch(console.error);
          scannerRef.current = null;
          onScanSuccess(decodedText);
          onClose();
        },
        (_error) => {
          // Failure callback - usually means no barcode found in current frame
          // We ignore this to avoid spamming the console
        }
      );
    }, 100);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
    };
  }, [isOpen, onScanSuccess, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Camera Scanner</DialogTitle>
          <DialogDescription>
            Point your camera at a product's barcode to scan it.
          </DialogDescription>
        </DialogHeader>

          <div id={`reader-${readerId}`} className="w-full min-h-[300px] overflow-hidden rounded-lg"></div>
      </DialogContent>
    </Dialog>
  );
}
