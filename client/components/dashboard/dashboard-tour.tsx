"use client";

import { useEffect, useState } from "react";
import { Joyride, STATUS, Step, EventData } from "react-joyride";

export function DashboardTour() {
  const [run, setRun] = useState(false);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem("dumos_client_tour_completed");
    if (!hasSeenTour) {
      // Small delay to ensure the DOM is fully rendered
      const timer = setTimeout(() => {
        setRun(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const steps: Step[] = [
    {
      target: "body",
      content:
        "Welcome to DumosRx! Let's take a quick tour of your Store Management App. Feel free to skip this tour if you're familiar with the app.",
      placement: "center",
      skipBeacon: true,
    },
    {
      target: "#tour-nav-dashboard",
      content:
        "This is your main dashboard, showing daily sales and vital store metrics.",
      placement: "right",
    },
    {
      target: "#tour-nav-stock-batch",
      content:
        "Manage all your products, variations, and stock levels from here.",
      placement: "right",
    },
    {
      target: "#tour-nav-pos",
      content:
        "Access the Point of Sale terminal to ring up customers and process offline transactions.",
      placement: "right",
    },
    {
      target: "#tour-nav-customers",
      content:
        "View and manage all your loyal customers and their purchase history.",
      placement: "right",
    },
    {
      target: "#tour-nav-settings",
      content:
        "Configure your store settings, receipt printing, and synchronization.",
      placement: "right",
    },
    {
      target: "#tour-nav-collapse",
      content:
        "Expand or shrink the sidebar to give yourself more screen space.",
      placement: "right",
    },
    {
      target: "#tour-sync-indicator",
      content:
        "Ensure your data is securely backed up and synced across all your devices.",
      placement: "right",
    },
    {
      target: "#tour-theme-customizer",
      content: "Personalize your dashboard with custom colors and shapes.",
      placement: "left",
    },
    {
      target: "#tour-theme-toggle",
      content:
        "Customize your visual experience by switching between light and dark themes.",
      placement: "left",
    },
  ];

  const handleJoyrideEvent = (data: EventData) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      localStorage.setItem("dumos_client_tour_completed", "true");
    }
  };

  if (typeof window === "undefined") return null;

  return (
    <Joyride
      onEvent={handleJoyrideEvent}
      continuous
      run={run}
      scrollToFirstStep
      steps={steps}
      locale={{ last: "Finish" }}
      styles={{
        tooltipContainer: {
          textAlign: "left",
        },
        buttonPrimary: {
          backgroundColor: "var(--color-primary)",
          borderRadius: "8px",
        },
        buttonBack: {
          marginRight: 10,
        },
        buttonSkip: {
          color: "#64748b", // slate-500
        },
      }}
      options={{
        primaryColor: "var(--color-primary)", // primary theme color
        zIndex: 1000,
        showProgress: true,
        buttons: ["back", "close", "primary", "skip"],
      }}
    />
  );
}
