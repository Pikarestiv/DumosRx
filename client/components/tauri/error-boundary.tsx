"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { logCrash } from "@/lib/utils/error-logger";
import { CHUNK_RELOAD_GUARD_KEY, isChunkLoadError } from "@/lib/utils/chunk-error";

interface Props {
  children: ReactNode;
}

const IDB_KEYVAL_STORE = "keyval-store";

interface State {
  hasError: boolean;
  error: Error | null;
  resetArmed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    resetArmed: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, resetArmed: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught component error:", error, errorInfo);
    void logCrash(error, true);

    if (isChunkLoadError(error) && typeof window !== "undefined") {
      const alreadyTried = window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY);
      if (!alreadyTried) {
        window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, "1");
        window.location.reload();
      }
    }
  }

  private wipeLocalData = () => {
    try {
      indexedDB.deleteDatabase(IDB_KEYVAL_STORE);
    } catch (e) {
      console.error("Failed to delete local database", e);
    }
    localStorage.clear();
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 text-destructive mb-2">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-3xl font-serif font-black tracking-tight">Something Went Wrong</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              The application encountered an unexpected interface crash:
              <code className="block mt-3 p-3 bg-muted rounded-lg text-left text-xs overflow-x-auto text-destructive font-mono border">
                {this.state.error?.message || String(this.state.error)}
              </code>
            </p>
            <div className="flex flex-col gap-4 justify-center pt-2">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg shadow-lg hover:bg-primary/90 transition-all text-sm cursor-pointer"
              >
                Reload Application
              </button>

              {!this.state.resetArmed && (
                <button
                  data-testid="reset-app-data"
                  onClick={() => this.setState({ resetArmed: true })}
                  className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors cursor-pointer"
                >
                  Reset App Data
                </button>
              )}

              {this.state.resetArmed && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-left space-y-3">
                  <p className="text-xs text-foreground leading-relaxed">
                    This <strong>deletes all data stored on this device</strong>, including
                    any sales, stock changes and counts that have not yet synced to the
                    cloud. Those are not recoverable. Try reloading first, and only reset
                    if support has told you to.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      data-testid="reset-app-data-confirm"
                      onClick={this.wipeLocalData}
                      className="px-4 py-2 bg-destructive text-destructive-foreground font-semibold rounded-lg text-xs cursor-pointer hover:bg-destructive/90 transition-colors"
                    >
                      Delete local data and reset
                    </button>
                    <button
                      onClick={() => this.setState({ resetArmed: false })}
                      className="px-4 py-2 bg-background border hover:bg-muted text-foreground font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                    >
                      Keep my data
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
