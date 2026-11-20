import { describe, expect, it } from "vitest";
import { HeartPulse, Hand, Leaf, Smile, Sparkles, Zap } from "lucide-react";
import { getServiceIcon } from "@/lib/constants/service-icons";

describe("getServiceIcon", () => {
  it("picks an icon from the service name before the category", () => {
    expect(getServiceIcon("Dentals", "Gum Contouring")).toBe(Smile);
    expect(getServiceIcon("Laser treatments", "Full Leg")).toBe(Zap);
    expect(getServiceIcon("Body Massage", "Deep Tissue Massage")).toBe(Hand);
    expect(getServiceIcon("Wellness", "Wellness Treats")).toBe(Leaf);
  });

  it("falls back to the category keyword icon when the service name has no match", () => {
    expect(getServiceIcon("Cardiology", "Blood pressure check")).toBe(HeartPulse);
  });

  it("gives every unmatched service the same neutral icon instead of a random one", () => {
    expect(getServiceIcon("Facial Treatments", "LED Facial")).toBe(Sparkles);
    expect(getServiceIcon("Miscellaneous", "Something Custom")).toBe(Sparkles);
    expect(getServiceIcon(null, null)).toBe(Sparkles);
  });
});
