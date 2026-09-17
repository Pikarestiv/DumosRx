import { describe, it, expect } from "vitest";
import { isNativeMobileApp } from "@/lib/utils";

describe("isNativeMobileApp", () => {
  it("is false in a plain browser tab, even on a phone-sized viewport", () => {
    expect(isNativeMobileApp(false, "")).toBe(false);
  });

  it("is false for an installed PWA (still just a browser context, not Tauri)", () => {
    expect(isNativeMobileApp(false, "")).toBe(false);
  });

  it("is false for the Tauri desktop build", () => {
    expect(isNativeMobileApp(true, "windows")).toBe(false);
    expect(isNativeMobileApp(true, "macos")).toBe(false);
    expect(isNativeMobileApp(true, "linux")).toBe(false);
  });

  it("is true for the Tauri Android build", () => {
    expect(isNativeMobileApp(true, "android")).toBe(true);
  });

  it("is true for the Tauri iOS build", () => {
    expect(isNativeMobileApp(true, "ios")).toBe(true);
  });

  it("is case-insensitive on the OS type", () => {
    expect(isNativeMobileApp(true, "Android")).toBe(true);
  });
});
