"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Flashlight,
  FlashlightOff,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

interface CameraScannerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (barcode: string) => void;
}

type ScanState = "prompt" | "requesting" | "scanning" | "denied" | "error";

const READER_ELEMENT_ID = "camera-scanner-reader";

export function CameraScannerDialog({
  isOpen,
  onClose,
  onScanSuccess,
}: CameraScannerDialogProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [state, setState] = useState<ScanState>("prompt");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameraCount, setCameraCount] = useState(0);
  const cameraIndexRef = useRef(0);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner && scanner.isScanning) {
      try {
        await scanner.stop();
      } catch {
        // Already stopped or never fully started — safe to ignore.
      }
    }
  }, []);

  const startScanner = useCallback(
    async (cameraIndex = 0) => {
      setState("requesting");
      try {
        const cameras = await Html5Qrcode.getCameras();
        setCameraCount(cameras.length);
        const camera = cameras[cameraIndex] ?? cameras[0];

        const scanner = new Html5Qrcode(READER_ELEMENT_ID, { verbose: false });
        scannerRef.current = scanner;

        await scanner.start(
          camera ? { deviceId: { exact: camera.id } } : { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 }, disableFlip: false },
          (decodedText) => {
            stopScanner();
            onScanSuccess(decodedText);
            onClose();
          },
          () => {
            // Per-frame "no barcode found" — expected on nearly every frame, ignore.
          },
        );

        setState("scanning");
        setTorchSupported(
          Boolean(scanner.getRunningTrackCameraCapabilities().torchFeature().isSupported()),
        );
      } catch (error) {
        console.error("Camera scanner failed to start:", error);
        const name = (error as { name?: string })?.name;
        setState(name === "NotAllowedError" ? "denied" : "error");
      }
    },
    [onClose, onScanSuccess, stopScanner],
  );

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      setState("prompt");
      setTorchOn(false);
      setTorchSupported(false);
      cameraIndexRef.current = 0;
      return;
    }
    return () => {
      stopScanner();
    };
  }, [isOpen, stopScanner]);

  const toggleTorch = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    const next = !torchOn;
    try {
      await scanner.getRunningTrackCameraCapabilities().torchFeature().apply(next);
      setTorchOn(next);
    } catch (error) {
      console.error("Failed to toggle torch:", error);
    }
  };

  const switchCamera = async () => {
    if (cameraCount < 2) return;
    await stopScanner();
    cameraIndexRef.current = (cameraIndexRef.current + 1) % cameraCount;
    startScanner(cameraIndexRef.current);
  };

  return (
    <ResponsiveModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title="Scan Barcode"
      description={
        state === "scanning"
          ? "Align the barcode within the frame."
          : "Point your camera at a product's barcode to scan it."
      }
      className="sm:max-w-md"
    >
      <div className="relative w-full min-h-[320px] overflow-hidden rounded-2xl bg-black">
        {/* html5-qrcode injects its <video>/<canvas> here */}
        <div id={READER_ELEMENT_ID} className="w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full" />

        {state === "scanning" && (
          <>
            {/* Dimmed backdrop with a clear viewfinder cutout */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative w-[260px] h-[160px]">
                <div className="absolute inset-0 rounded-xl ring-[999px] ring-black/50" />
                <div className="absolute inset-0 rounded-xl border-2 border-white/80" />
                {/* Corner brackets */}
                {[
                  "top-0 left-0 border-t-4 border-l-4 rounded-tl-xl",
                  "top-0 right-0 border-t-4 border-r-4 rounded-tr-xl",
                  "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl",
                  "bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl",
                ].map((cls) => (
                  <div
                    key={cls}
                    className={`absolute w-7 h-7 border-primary ${cls}`}
                  />
                ))}
                {/* Animated scan line */}
                <div className="absolute inset-x-0 top-0 h-0.5 bg-primary shadow-[0_0_8px_2px] shadow-primary animate-scan-line" />
              </div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-3">
              {torchSupported && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className="flex items-center justify-center h-10 w-10 rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
                >
                  {torchOn ? (
                    <FlashlightOff className="h-5 w-5" />
                  ) : (
                    <Flashlight className="h-5 w-5" />
                  )}
                </button>
              )}
              {cameraCount > 1 && (
                <button
                  type="button"
                  onClick={switchCamera}
                  className="flex items-center justify-center h-10 w-10 rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              )}
            </div>
          </>
        )}

        {state === "prompt" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center bg-card">
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-primary/10">
              <Camera className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Camera access needed</p>
              <p className="text-sm text-muted-foreground mt-1">
                We only use your camera to scan barcodes — nothing is recorded or stored.
              </p>
            </div>
            <Button onClick={() => startScanner(0)}>Enable Camera</Button>
          </div>
        )}

        {state === "requesting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Waiting for camera permission...</p>
          </div>
        )}

        {(state === "denied" || state === "error") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center bg-card">
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-destructive/10">
              <ShieldAlert className="h-7 w-7 text-destructive" />
            </div>
            <div>
              <p className="font-semibold">
                {state === "denied" ? "Camera access denied" : "Couldn't start the camera"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {state === "denied"
                  ? "Enable camera access for this app in your device Settings, then try again."
                  : "Something went wrong starting the camera. Please try again."}
              </p>
            </div>
            <Button variant="outline" onClick={() => startScanner(0)}>
              Try Again
            </Button>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
