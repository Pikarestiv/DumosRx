import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { STORE_TYPES } from "@/lib/constants/store-types";
import { registerSchema, type RegisterFormValues } from "@/components/auth/hooks/use-register-form";
import { StoreDetails } from "@/components/auth/register-form-fields/store-details";
import { Form } from "@/components/ui/form";

const repoFile = (path: string) => readFileSync(resolve(__dirname, "..", "..", path), "utf8");

const VALID_REGISTRATION = {
  store_name: "Divamax",
  first_name: "Favour",
  last_name: "Mbonu",
  email: "owner@example.com",
  phone: "08012345678",
  pin: "1234",
  password: "password123",
  password_confirmation: "password123",
};

function RegisterStoreFields() {
  const form = useForm<RegisterFormValues>({ defaultValues: { store_name: "", store_type: "pharmacy" } });
  return (
    <Form {...form}>
      <StoreDetails form={form} itemVariant={{}} />
    </Form>
  );
}

describe("store type list", () => {
  it("offers exactly the store types the server accepts, in the same order", () => {
    const php = repoFile("laravel-server/app/Support/StoreTypes.php");
    const serverList = /public const IDS = \[([^\]]*)\]/.exec(php)?.[1] ?? "";
    const serverIds = [...serverList.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    expect(STORE_TYPES.map((type) => type.value)).toEqual(serverIds);
  });

  it("is the list the register form offers, with its display labels", () => {
    render(<RegisterStoreFields />);
    const options = screen.getAllByRole("option");

    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(STORE_TYPES.map((t) => t.value));
    expect(screen.getByRole("option", { name: "Hardware & Building Materials" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Auto Parts" })).toBeTruthy();
  });

  it.each(STORE_TYPES.map((type) => type.value))("lets the register form submit a %s store", (value) => {
    expect(registerSchema.safeParse({ ...VALID_REGISTRATION, store_type: value }).success).toBe(true);
  });

  it.each(["florist", "", "retail"])("rejects %j as a new registration's store type", (value) => {
    expect(registerSchema.safeParse({ ...VALID_REGISTRATION, store_type: value }).success).toBe(false);
  });
});
