"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { logCrash } from "@/lib/utils/error-logger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught component error:", error, errorInfo);
    logCrash(error, true);
  }

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
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg shadow-lg hover:bg-primary/90 transition-all text-sm cursor-pointer"
              >
                Reload Application
              </button>
              <button
                onClick={() => {
                  if (window.confirm("Warning: This will clear local app cache. Proceed?")) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}
                className="px-5 py-2.5 bg-background border hover:bg-muted text-foreground font-semibold rounded-lg transition-all text-sm cursor-pointer"
              >
                Reset App Data
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
