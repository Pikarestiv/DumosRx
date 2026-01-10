import api from "./axios";

export interface SubscriptionStatus {
  status: "active" | "inactive" | "expired" | "grace_period";
  plan?: string;
  expires_at?: string;
  days_remaining?: number;
  license_key?: string;
  message?: string;
}

export interface PaymentInitiation {
  amount: number;
  provider: "paystack" | "flutterwave" | "opay";
}

export interface PaymentResponse {
  message: string;
  transaction_reference: string;
  payment_url: string;
}

export const subscriptionApi = {
  getStatus: async (): Promise<SubscriptionStatus> => {
    const response = await api.get<SubscriptionStatus>("/subscription/status");
    return response.data;
  },

  verifyLicense: async (
    licenseKey: string,
    machineId: string,
  ): Promise<{ valid: boolean; expires_at?: string }> => {
    const response = await api.post("/subscription/verify", {
      license_key: licenseKey,
      machine_id: machineId,
    });
    return response.data;
  },

  initiatePayment: async (
    data: PaymentInitiation,
  ): Promise<PaymentResponse> => {
    const response = await api.post<PaymentResponse>("/subscription/pay", data);
    return response.data;
  },
};
