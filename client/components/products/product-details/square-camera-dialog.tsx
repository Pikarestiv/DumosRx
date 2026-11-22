"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { squareCropSource } from "@/lib/product-images/compress";

interface SquareCameraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  onCapture: (file: File) => void;
  onFallbackToFileInput: () => void;
}

const MAX_CAPTURE_EDGE = 1024;

function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function SquareCameraDialog({
  open,
  onOpenChange,
  productName,
  onCapture,
  onFallbackToFileInput,
}: SquareCameraDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const releaseStream = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        releaseStream();
        setCapturing(false);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, releaseStream],
  );

  useEffect(() => {
    if (!open) {
      releaseStream();
      return;
    }

    if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.getUserMedia !== "function") {
      return;
    }

    let cancelled = false;

    void navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1080 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stopStream(stream);
          return;
        }
        releaseStream();
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setErrorMessage(null);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(
          "Camera access is unavailable or was denied. You can still use your device camera.",
        );
      });

    return () => {
      cancelled = true;
      releaseStream();
    };
  }, [open, facingMode, handleOpenChange, onFallbackToFileInput, releaseStream]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0 || capturing) return;

    setCapturing(true);
    const { sx, sy, side, target } = squareCropSource(
      video.videoWidth,
      video.videoHeight,
      MAX_CAPTURE_EDGE,
    );
    const canvas = document.createElement("canvas");
    canvas.width = target;
    canvas.height = target;
    const context = canvas.getContext("2d");
    if (!context) {
      setCapturing(false);
      setStatus("error");
      setErrorMessage("Could not capture image on this device.");
      return;
    }

    if (facingMode === "user") {
      context.translate(target, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, sx, sy, side, side, 0, 0, target, target);

    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob) {
          setStatus("error");
          setErrorMessage("Could not save captured photo. Please try again.");
          return;
        }
        const file = new File([blob], "product-photo.jpg", { type: "image/jpeg" });
        handleOpenChange(false);
        onCapture(file);
      },
      "image/jpeg",
      0.92,
    );
  };

  const handleFallback = () => {
    handleOpenChange(false);
    onFallbackToFileInput();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Take square photo</DialogTitle>
          <DialogDescription>
            Center {productName} inside the square frame.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-black">
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Starting camera…</span>
            </div>
          )}

          {status === "error" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-destructive">{errorMessage}</p>
              <Button type="button" size="sm" variant="secondary" onClick={handleFallback}>
                <Camera className="h-4 w-4 mr-2" />
                Use device camera
              </Button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={
                  facingMode === "user"
                    ? "h-full w-full object-cover -scale-x-100"
                    : "h-full w-full object-cover"
                }
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-3 rounded-lg border border-primary/50"
              />
            </>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={status !== "ready" || capturing}
            onClick={() => {
              setStatus("loading");
              setErrorMessage(null);
              setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Flip
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={status !== "ready" || capturing}
              onClick={handleCapture}
            >
              {capturing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Camera className="h-4 w-4 mr-2" />
              )}
              Capture
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
