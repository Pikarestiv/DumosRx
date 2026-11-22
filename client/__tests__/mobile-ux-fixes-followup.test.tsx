import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const routerPush = vi.fn();
const mediaState = { isDesktop: false };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/prescriptions",
}));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => mediaState.isDesktop }));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", first_name: "Ada", last_name: "Obi", role: "admin" },
    isCloudLinked: true,
    isAdmin: true,
    canManageStockBatch: true,
    canManageCustomers: true,
    canManagePrescriptions: true,
  }),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeProfile: {
      id: "store-1",
      name: "Grace Pharmacy",
      currency: "NGN",
      store_type: "pharmacy",
      expiry_warning_days: 90,
      uppercase_display_enabled: 0,
    },
  }),
}));
vi.mock("@/lib/hooks/use-permissions", () => ({ useHasPermission: () => true }));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplay: () => false,
  useUppercaseDisplayClass: () => "",
  useDisplayName: () => (value: string) => value,
  capitalizeWords: (value: string) => value,
}));
vi.mock("@/lib/hooks/use-is-touch-device", () => ({ useIsTouchDevice: () => false }));
vi.mock("@/lib/hooks/use-online-orders-modal", () => ({
  useOnlineOrdersModal: () => ({ onOpen: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-broadcasts", () => ({ useBroadcasts: () => ({ data: [] }) }));
vi.mock("@/lib/db/queries/payables", () => ({
  getPayablesDueSummary: vi.fn(() => Promise.resolve({
    overdueCount: 2, overdueTotal: 50000, dueSoonCount: 0, dueSoonTotal: 0,
  })),
}));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    getNotifications: vi.fn(() => Promise.resolve([
      { id: "n-unread", title: "Stock alert", description: "Paracetamol stock is low", time: "5m ago", type: "stock", isRead: false, category: "system", link: "/inventory/overview" },
      { id: "n-read", title: "Daily backup complete", description: "Cloud sync completed successfully", time: "1h ago", type: "system", isRead: true, category: "system", link: "/settings" },
    ])),
    markNotificationRead: vi.fn(() => Promise.resolve(undefined)),
  },
}));
vi.mock("@/lib/hooks/queries/use-users", () => ({
  useUsers: () => ({ data: [{ id: "u1", first_name: "Ada", last_name: "Obi", is_active: true }] }),
}));
vi.mock("@/components/ui/date-range-picker", () => ({
  DateRangePicker: ({ className }: { className?: string }) => (
    <div data-testid="date-range-picker" className={className} />
  ),
}));

const reportExport = {
  getRows: vi.fn().mockResolvedValue([]),
  exportReportCsv: vi.fn(),
  downloadReportPdf: vi.fn(),
  printReport: vi.fn(),
  getRecentDownloads: () => [],
};
vi.mock("@/lib/hooks/use-report-export", () => ({
  useReportExport: () => reportExport,
  getReportNote: () => undefined,
  getReportHeaders: () => [],
}));

const mockExpiringBatches = [
  { id: "batch-exp", product_id: "prod-exp", name: "Augmentin 625mg", batch_number: "AUGM-2026", expiry_date: "2026-09-05", stock_quantity: 238, base_unit: "Cards" },
];
const mockFastMovers = {
  items: [{ id: "prod-fast", name: "Norvasc", soldQuantity: 12, revenue: 24000, prevQuantity: 6, percentageChange: 100 }],
};
vi.mock("@/lib/db/queries/inventory", () => ({
  getAvailableStockBatches: vi.fn(() => Promise.resolve([])),
  getFastMovers: vi.fn(() => Promise.resolve(mockFastMovers)),
  getExpiringBatches: vi.fn(() => Promise.resolve(mockExpiringBatches)),
}));
vi.mock("@/lib/db/queries/inventory-alerts", () => ({
  getExpiringBatches: vi.fn(() => Promise.resolve(mockExpiringBatches)),
}));
vi.mock("@/lib/db/queries/inventory-stats", () => ({
  getFastMovers: vi.fn(() => Promise.resolve(mockFastMovers)),
}));
vi.mock("@/lib/db/queries/prescriptions", () => ({
  getPrescriptionById: vi.fn(() => Promise.resolve(null)),
  getPrescriptionItems: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/lib/hooks/use-save-prescription-mutation", () => ({
  useSavePrescriptionMutation: () => ({ mutateAsync: vi.fn(() => Promise.resolve({})), isPending: false }),
}));

import { BrandLogo } from "@/components/ui/brand-logo";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { NeedsAttention } from "@/components/stock-batch/needs-attention";
import { FastMovers } from "@/components/stock-batch/fast-movers";
import { PrescriptionList } from "@/components/prescriptions/prescription-list";
import { ReportCenter } from "@/components/reports/report-center";
import { NewPrescription } from "@/components/prescriptions/new-prescription";
import type { Prescription } from "@/lib/hooks/use-prescription-queue";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function createQueryWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function QueryWrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("iOS & mobile UX follow-up fixes", () => {
  const originalVibrate = navigator.vibrate;
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    mediaState.isDesktop = false;
    routerPush.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "vibrate", {
      value: originalVibrate,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, "userAgent", { value: originalUserAgent, configurable: true });
    vi.restoreAllMocks();
  });

  it("uses navigator.vibrate when supported and falls back to synchronous iOS switch toggle when unavailable", async () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrateMock, configurable: true, writable: true });
    vi.resetModules();
    const { triggerHapticFeedback: vibrateHaptic } = await import("@/lib/utils/haptics");
    vibrateHaptic(10);
    expect(vibrateMock).toHaveBeenCalledWith(10);
    expect(document.querySelector('input[type="checkbox"][switch]')).toBeNull();

    Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true, writable: true });
    Object.defineProperty(navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      configurable: true,
    });
    const labelClickSpy = vi.spyOn(HTMLLabelElement.prototype, "click");
    vi.resetModules();
    const { triggerHapticFeedback: iosHaptic } = await import("@/lib/utils/haptics");
    iosHaptic(10);

    const switchInput = document.querySelector('input[type="checkbox"][switch]');
    expect(switchInput).not.toBeNull();
    expect(labelClickSpy).toHaveBeenCalledTimes(1);
    switchInput?.closest("label")?.remove();
  });

  it("renders BrandLogo using primary theme color via CSS mask without purple filter drift", () => {
    render(<BrandLogo src="/logo.png" alt="DumosRx Logo" width={150} height={60} />);
    const logo = screen.getByRole("img", { name: "DumosRx Logo" });
    expect(logo.className).toContain("bg-primary");
    expect(logo.getAttribute("style")).toContain("/logo.png");
  });

  it("aligns Overdue beside the unread indicator and distinguishes unread notification rows", async () => {
    const wrapper = createQueryWrapper();
    render(<NotificationBell />, { wrapper });

    const bell = screen.getByRole("button", { name: /notifications/i });
    fireEvent.pointerDown(bell, { button: 0, ctrlKey: false, pointerType: "mouse" });

    const overdueText = await screen.findByText("Overdue");
    const overdueRow = overdueText.closest("[role='menuitem']") as HTMLElement;
    expect(overdueRow).not.toBeNull();
    expect(overdueRow.textContent).toContain("Payables");
    expect(overdueText.parentElement?.className).toContain("items-center");
    expect(overdueText.parentElement?.querySelector(".rounded-full")).not.toBeNull();

    const readTime = await screen.findByText("1h ago");
    expect(readTime.parentElement?.querySelector(".rounded-full")).toBeNull();
    const unreadRow = (await screen.findByText("Stock alert")).closest("[role='menuitem']") as HTMLElement;
    const readRow = (await screen.findByText("Daily backup complete")).closest("[role='menuitem']") as HTMLElement;
    expect(unreadRow.firstElementChild?.className).toContain("bg-blue-50/90");
    expect(readRow.firstElementChild?.className).not.toContain("bg-blue-50/90");
  });

  it("opens Product Details from NeedsAttention cards, View batch, and FastMovers without bubbling Reorder clicks", async () => {
    const onSelectProduct = vi.fn();
    const wrapper = createQueryWrapper();
    render(
      <>
        <NeedsAttention
          stockData={[
            {
              id: "prod-low",
              product_id: "prod-low",
              product_name: "Paracetamol",
              quantity: 2,
              reorder_level: 10,
              base_unit: "Card",
              status: "low",
            },
          ]}
          onSelectProduct={onSelectProduct}
        />
        <FastMovers onSelectProduct={onSelectProduct} />
      </>,
      { wrapper },
    );

    const lowCard = (await screen.findByText("Paracetamol")).closest("div[class*='cursor-pointer']") as HTMLElement;
    fireEvent.click(lowCard);
    expect(onSelectProduct).toHaveBeenLastCalledWith("prod-low", { tab: "details" });

    onSelectProduct.mockClear();
    fireEvent.click(within(lowCard).getByText("Reorder", { selector: "button" }));
    expect(onSelectProduct).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalled();

    const expCard = (await screen.findByText("Augmentin 625mg")).closest("div[class*='cursor-pointer']") as HTMLElement;
    fireEvent.click(expCard);
    expect(onSelectProduct).toHaveBeenLastCalledWith("prod-exp", { tab: "batches", batchId: "batch-exp" });

    onSelectProduct.mockClear();
    fireEvent.click(within(expCard).getByText("View batch", { selector: "button" }));
    expect(onSelectProduct).toHaveBeenCalledTimes(1);
    expect(onSelectProduct).toHaveBeenLastCalledWith("prod-exp", { tab: "batches", batchId: "batch-exp" });

    fireEvent.click(await screen.findByText("Norvasc"));
    expect(onSelectProduct).toHaveBeenLastCalledWith("prod-fast");
  });

  it("switches PrescriptionList between mobile flow cards and desktop list without an inner mobile scroll trap", () => {
    const samplePrescriptions: Prescription[] = [
      {
        id: "rx-1",
        prescriptionNumber: "RX-2026-576",
        patientName: "Sommy",
        patientPhone: "08123456789",
        patientAge: 29,
        doctorName: "Dr. Akintola",
        doctorLicense: "MD-100",
        dateIssued: "2026-11-18T02:47:00.000Z",
        status: "ready",
        priority: "normal",
        medications: [],
        totalCost: 600,
        hasRefillDue: false,
      },
    ];
    const onSelectPrescription = vi.fn();
    const { container, rerender } = render(
      <PrescriptionList
        prescriptions={samplePrescriptions}
        selectedPrescription={null}
        onSelect={onSelectPrescription}
        searchTerm=""
        setSearchTerm={() => {}}
      />,
    );

    expect(container.querySelector(".overflow-y-auto")).toBeNull();
    fireEvent.click(screen.getByText("Sommy"));
    expect(onSelectPrescription).toHaveBeenCalledWith(samplePrescriptions[0]);

    mediaState.isDesktop = true;
    rerender(
      <PrescriptionList
        prescriptions={samplePrescriptions}
        selectedPrescription={null}
        onSelect={onSelectPrescription}
        searchTerm=""
        setSearchTerm={() => {}}
      />,
    );
    expect(container.querySelector(".overflow-y-auto")).not.toBeNull();
  });

  it("renders ReportCenter cleanly without mobile wrapper card chrome and renders NewPrescription without error", () => {
    const wrapper = createQueryWrapper();
    const { container: reportContainer } = render(<ReportCenter />, { wrapper });
    const wrapperCard = reportContainer.querySelector('[data-slot="card"]') as HTMLElement;
    expect(wrapperCard).not.toBeNull();
    expect(wrapperCard.className).toContain("bg-transparent");
    const subtitle = within(reportContainer).getByText("Generate and download structured data exports");
    expect(subtitle.closest(".hidden")).not.toBeNull();
    expect(within(reportContainer).getByText("Detailed Sales Report")).toBeTruthy();

    const { container: rxContainer } = render(<NewPrescription />, { wrapper });
    expect(within(rxContainer).getByText("Patient Information")).toBeTruthy();
    expect(within(rxContainer).getByRole("button", { name: /create prescription/i })).toBeTruthy();
  });
});
