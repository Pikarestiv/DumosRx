export type OnboardingStep = "welcome" | "register" | "cloud" | "backup" | "syncing" | "select-store";

const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  "welcome", "register", "cloud", "backup", "syncing", "select-store",
];

export function parseOnboardingStep(value: string | null): OnboardingStep {
  return ONBOARDING_STEPS.find((step) => step === value) ?? "welcome";
}
