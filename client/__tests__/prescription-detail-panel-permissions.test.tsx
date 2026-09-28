import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

import { PrescriptionDetailPanel } from "@/components/prescriptions/prescription-detail-panel";
import type { Prescription } from "@/lib/hooks/use-prescription-queue";

function makePrescription(overrides: Partial<Prescription> = {}): Prescription {
  return {
    id: "rx-1",
    prescriptionNumber: "RX-0001",
    patientName: "Ada Nwosu",
    patientPhone: "0800",
    patientAge: 34,
    insurance: "",
    doctorName: "Dr. Obi",
    doctorLicense: "LIC-1",
    dateIssued: "2026-09-01T09:00:00.000Z",
    status: "pending",
    priority: "normal",
    notes: "",
    totalCost: 1200,
    medications: [],
    hasRefillDue: false,
    ...overrides,
  } as Prescription;
}

function renderPanel(prescription: Prescription) {
  render(
    <PrescriptionDetailPanel
      prescription={prescription}
      getPriorityBadge={() => null}
      formatDateTime={(value) => value}
      onClose={() => {}}
      onEdit={() => {}}
      onDispense={() => {}}
      onDispenseRefill={() => {}}
      onProcessReturn={() => {}}
      updateStatus={() => {}}
    />,
  );
}

/**
 * The detail panel's action row is the app's only prescription-fulfilment
 * surface. "manage_prescriptions" owns the record's own data (Edit);
 * "dispense_prescriptions" owns the whole fulfilment pipeline that ends in
 * medicine leaving the shelf - Process, Mark Ready, Dispense and Dispense
 * Refill. Process Return is neither and stays ungated.
 */
describe("prescription detail panel permissions", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("shows Edit on a pending prescription with manage_prescriptions", () => {
    renderPanel(makePrescription({ status: "pending" }));
    expect(screen.getByRole("button", { name: /Edit/ })).toBeTruthy();
  });

  it("hides Edit without manage_prescriptions but keeps the record visible", () => {
    hasPermission.mockImplementation((key) => key !== "manage_prescriptions");
    renderPanel(makePrescription({ status: "pending" }));
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    expect(screen.getAllByText("Ada Nwosu").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Process/ })).toBeTruthy();
  });

  it("hides Process without dispense_prescriptions", () => {
    hasPermission.mockImplementation((key) => key !== "dispense_prescriptions");
    renderPanel(makePrescription({ status: "pending" }));
    expect(screen.queryByRole("button", { name: /Process/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Edit/ })).toBeTruthy();
  });

  it("hides Mark Ready without dispense_prescriptions", () => {
    hasPermission.mockImplementation((key) => key !== "dispense_prescriptions");
    renderPanel(makePrescription({ status: "in_progress" }));
    expect(screen.queryByRole("button", { name: /Mark Ready/ })).toBeNull();
  });

  it("hides Dispense on a ready prescription without dispense_prescriptions", () => {
    hasPermission.mockImplementation((key) => key !== "dispense_prescriptions");
    renderPanel(makePrescription({ status: "ready" }));
    expect(screen.queryByRole("button", { name: /Dispense/ })).toBeNull();
    expect(screen.getByText("RX-0001")).toBeTruthy();
  });

  it("shows Dispense on a ready prescription with dispense_prescriptions", () => {
    renderPanel(makePrescription({ status: "ready" }));
    expect(screen.getByRole("button", { name: /Dispense/ })).toBeTruthy();
  });

  it("hides Dispense Refill but keeps Process Return without dispense_prescriptions", () => {
    hasPermission.mockImplementation((key) => key !== "dispense_prescriptions");
    renderPanel(
      makePrescription({ status: "completed", hasRefillDue: true }),
    );
    expect(screen.queryByRole("button", { name: /Dispense Refill/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Process Return/ })).toBeTruthy();
  });

  it("checks both prescription keys specifically", () => {
    renderPanel(makePrescription({ status: "ready" }));
    expect(hasPermission).toHaveBeenCalledWith("dispense_prescriptions");
    expect(hasPermission).toHaveBeenCalledWith("manage_prescriptions");
  });
});
