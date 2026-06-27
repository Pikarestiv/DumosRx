"use client";

import { useEffect, useState } from "react";
import { Joyride, STATUS, Step, EventData } from "react-joyride";

export function DashboardTour() {
  const [run, setRun] = useState(false);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem("dumos_dashboard_tour_completed");
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
        "Welcome to DumosRx! Let's take a quick tour of your Store Dashboard. Feel free to skip this tour if you're familiar with the dashboard.",
      placement: "center",
      skipBeacon: true,
    },
    {
      target: "#tour-nav-overview",
      content:
        "This is your main overview, showing daily sales and vital store metrics.",
      placement: "right",
    },
    /*
    {
      target: "#tour-header-search",
      content: "Instantly search across your stores, products, or transactions from anywhere.",
      placement: "bottom",
    },
    {
      target: "#tour-header-actions",
      content: "Toggle dark mode or view your real-time system notifications here.",
      placement: "bottom",
    },
    */
    {
      target: "#tour-overview-stats",
      content:
        "Get an instant snapshot of your sales, active staff, and stock_batch counts.",
      placement: "top",
    },
    {
      target: "#tour-overview-add-store",
      content:
        "Quickly provision and add a new physical or digital store to your network.",
      placement: "bottom",
    },
    /*
    {
      target: "#tour-overview-stores",
      content: "Monitor the real-time sync status and performance of all your connected branches.",
      placement: "top",
    },
    {
      target: "#tour-nav-notifications",
      content: "Stay updated with important system alerts and staff notifications.",
      placement: "right",
    },
    */
    {
      target: "#tour-nav-fleet",
      content:
        "Manage your physical store locations and staff assignments here.",
      placement: "right",
    },
    {
      target: "#tour-nav-staff",
      content:
        "Add staff, assign roles, and control their access to the system.",
      placement: "right",
    },
    /*
    {
      target: "#tour-nav-activities",
      content: "Track staff activities, sales records, and stock_batch changes.",
      placement: "right",
    },
    {
      target: "#tour-nav-billing",
      content: "Manage your DumosRx subscription and billing details.",
      placement: "right",
    },
    {
      target: "#tour-nav-downloads",
      content: "Download the DumosRx mobile or desktop apps for your devices.",
      placement: "right",
    },
    {
      target: "#tour-nav-profile",
      content: "Access your account security settings and profile details.",
      placement: "right",
    },
    */
    {
      target: "#tour-profile",
      content: "Quickly view your user info and securely log out here.",
      placement: "top",
    },
  ];

  const handleJoyrideEvent = (data: EventData) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      localStorage.setItem("dumos_dashboard_tour_completed", "true");
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
