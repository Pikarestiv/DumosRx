import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// PrescriptionMedications only reads storeProfile.currency from useStore()
// (for the money-formatted cost hint); it doesn't need a real StoreProvider
// or its underlying DB-backed queries.
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN" } }),
}));

import { PrescriptionMedications } from "@/components/prescriptions/new-prescription/prescription-medications";
import type {
  AvailablePrescriptionProduct,
  NewMedicationForm,
  NewPrescriptionForm,
} from "@/components/prescriptions/new-prescription/use-new-prescription";

// React 19's `act` warns unless the environment explicitly opts in.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression coverage for: "Strength selector is unusable (but harmless)
 * for any product with a blank `strength` column" (_findings-log.md).
 *
 * The New Prescription form's "Strength *" combobox was populated only from
 * a chosen product's non-empty `strength` values, so a product with a blank
 * `products.strength` (common on this store's imported catalog) rendered a
 * required-looking dropdown with zero options. Fix: fall back to a free-text
 * Input when the selected product has no non-empty strength options.
 *
 * No @testing-library/react is installed in this repo (see
 * use-pos-payment-loyalty-gate.test.ts), so this uses the same manual
 * react-dom/client + `act` harness, asserting on plain DOM nodes.
 */
describe("PrescriptionMedications strength field fallback", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  const baseFormData: NewPrescriptionForm = {
    patientName: "",
    patientPhone: "",
    patientAge: "",
    doctorName: "",
    doctorLicense: "",
    priority: "normal" as any,
    insurance: "",
    medications: [],
    notes: "",
  };

  function renderWithProduct(
    productName: string,
    availableProducts: AvailablePrescriptionProduct[],
  ) {
    const newMedication: NewMedicationForm = {
      productName,
      strength: "",
      dosage: "",
      quantity: "",
      instructions: "",
      refillsAuthorized: "",
      refillIntervalDays: "",
      unitCost: "",
    };

    act(() => {
      root.render(
        React.createElement(PrescriptionMedications, {
          formData: baseFormData,
          newMedication,
          setNewMedication: () => {},
          availableProducts,
          addMedication: () => {},
          removeMedication: () => {},
          editMedication: () => {},
          formatCurrency: (n: number) => `#${n}`,
          totalCost: 0,
        }),
      );
    });
  }

  it("falls back to a free-text input when the selected product has no non-empty strength values", () => {
    renderWithProduct("TRAMADOL 100MG", [
      { name: "TRAMADOL 100MG", strength: "", cost: 500, stock_batch_id: "b1" },
    ]);

    const freeTextInput = container.querySelector(
      'input[placeholder="Enter strength (e.g. 500mg)"]',
    );
    expect(freeTextInput).not.toBeNull();

    // The combobox trigger button (placeholder "Select strength") must not
    // render in this case — no unselectable empty dropdown.
    expect(container.textContent).not.toContain("Select strength");
  });

  it("keeps the normal combobox when the selected product DOES have strength options", () => {
    renderWithProduct("PANADOL", [
      { name: "PANADOL", strength: "500mg", cost: 200, stock_batch_id: "b2" },
      { name: "PANADOL", strength: "1000mg", cost: 300, stock_batch_id: "b3" },
    ]);

    const freeTextInput = container.querySelector(
      'input[placeholder="Enter strength (e.g. 500mg)"]',
    );
    expect(freeTextInput).toBeNull();

    expect(container.textContent).toContain("Select strength");
  });

  it("shows the normal (disabled) combobox, not the free-text fallback, before any product is selected", () => {
    renderWithProduct("", []);

    const freeTextInput = container.querySelector(
      'input[placeholder="Enter strength (e.g. 500mg)"]',
    );
    expect(freeTextInput).toBeNull();
    expect(container.textContent).toContain("Select strength");
  });
});
