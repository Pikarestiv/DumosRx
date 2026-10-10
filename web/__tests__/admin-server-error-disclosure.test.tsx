import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AxiosAdapter } from "axios";
import { apiClient, presentableErrorMessage, SERVER_FAULT_MESSAGE } from "@/lib/api/base-client";
import { TillCodesCard } from "@/components/admin/views/till-codes-card";
import type { AdminTillCode } from "@/lib/api/admin-hooks-till-codes";

const SQL_EXCEPTION =
  "SQLSTATE[42S22]: Column not found: 1054 Unknown column 'code_encrypted' in 'INSERT INTO' " +
  "(Connection: mysql, Host: 127.0.0.1, Port: 3306, Database: dumomvte_dumosrx_dev_db, " +
  "SQL: insert into `admin_till_codes` (`code_hash`, `code_encrypted`) values ($2y$12$O8uOl6oe, eyJpdiI6IjZ5bzNn))";

const CAP_REFUSAL = "Revoke an existing code first; three active codes is the maximum.";

const { state } = vi.hoisted(() => ({
  state: { failure: null as string | null },
}));

vi.mock("@/lib/api/admin-hooks-till-codes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/admin-hooks-till-codes")>();
  return {
    ...actual,
    useMyTillCodes: () => ({ data: { codes: [] as AdminTillCode[] }, isLoading: false }),
    useIssueTillCodeMutation: () => ({
      mutateAsync: () => Promise.reject(new Error(state.failure ?? "")),
      isPending: false,
      reset: () => {},
    }),
    useRevokeTillCodeMutation: () => ({ mutateAsync: () => Promise.resolve({}), isPending: false }),
  };
});

const rejectWith = (status: number, data: unknown): AxiosAdapter =>
  ((config) =>
    Promise.reject(
      Object.assign(new Error(`Request failed with status code ${status}`), {
        config,
        isAxiosError: true,
        response: { status, data, config, headers: {}, statusText: "" },
      }),
    )) as AxiosAdapter;

const messageFromRequest = async (status: number, data: unknown): Promise<string> => {
  const original = apiClient.defaults.adapter;
  apiClient.defaults.adapter = rejectWith(status, data);
  try {
    await apiClient.post("/admin/till-codes", {});
    throw new Error("request unexpectedly succeeded");
  } catch (error) {
    return (error as Error).message;
  } finally {
    apiClient.defaults.adapter = original;
  }
};

describe("server error disclosure in the admin panel", () => {
  beforeEach(() => {
    state.failure = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not promote an unhandled exception's message onto the thrown error", async () => {
    const message = await messageFromRequest(500, {
      message: SQL_EXCEPTION,
      exception: "Illuminate\\Database\\QueryException",
      file: "/home/vendor/laravel/framework/src/Illuminate/Database/Connection.php",
      line: 825,
    });

    expect(message).toBe(SERVER_FAULT_MESSAGE);
    expect(message).not.toContain("SQLSTATE");
    expect(message).not.toContain("dumomvte_dumosrx_dev_db");
    expect(message).not.toContain("$2y$12$");
  });

  it("still promotes a validated 422 refusal's own wording", async () => {
    const message = await messageFromRequest(422, { message: CAP_REFUSAL, error: CAP_REFUSAL });

    expect(message).toBe(CAP_REFUSAL);
  });

  it("treats an exception-shaped message as a fault even outside the 5xx range", () => {
    expect(presentableErrorMessage(400, { message: SQL_EXCEPTION })).toBe(SERVER_FAULT_MESSAGE);
    expect(
      presentableErrorMessage(404, {
        message: "Not found",
        exception: "Symfony\\Component\\HttpKernel\\Exception\\NotFoundHttpException",
      }),
    ).toBe(SERVER_FAULT_MESSAGE);
  });

  it("gives the same message whether or not APP_DEBUG filled the body in", () => {
    expect(presentableErrorMessage(500, { message: "Server Error" })).toBe(SERVER_FAULT_MESSAGE);
    expect(presentableErrorMessage(500, { message: SQL_EXCEPTION })).toBe(SERVER_FAULT_MESSAGE);
  });

  it("leaves a body with no message alone", () => {
    expect(presentableErrorMessage(500, {})).toBeNull();
    expect(presentableErrorMessage(undefined, undefined)).toBeNull();
  });

  it("renders the generic message in the Till Access card rather than the exception", async () => {
    state.failure = SERVER_FAULT_MESSAGE;
    render(<TillCodesCard />);

    await userEvent.click(screen.getByRole("button", { name: /generate code/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(SERVER_FAULT_MESSAGE);
    });
  });
});
