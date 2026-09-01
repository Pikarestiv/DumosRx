import { BaseApiClient } from "./base-client";
import type { StoreOption, FleetStore, FleetStorePayload, FleetStats } from "@/lib/types/store";
import type { OnlineOrder } from "@/lib/types/online-order";
import type {
  SubscriptionStatus,
  PaymentPayload,
  PaymentResponse,
  ReferralStats,
  CouponValidationResponse,
  BillingTransaction,
} from "@/lib/types/subscription-plans";

/**
 * Fleet (multi-store management), subscription/billing, notifications,
 * online orders, and account-deletion endpoints — split out from ApiClient
 * (client.ts) purely to keep that file's line count down. ApiClient extends
 * this class, so every method here is still called as e.g.
 * `apiClient.getStores()`; no call site needs to know this split exists.
 */
export class FleetBillingApiClient extends BaseApiClient {
  // Stores
  async getStores() {
    return this.request<StoreOption[]>("/stores");
  }

  async checkStoreSlug(slug: string, ignoreId?: string) {
    const url = `/stores/check-slug?slug=${encodeURIComponent(slug)}${ignoreId ? `&ignore_id=${ignoreId}` : ""}`;
    return this.request<{ available: boolean; slug: string }>(url);
  }

  async createStore(payload: FleetStorePayload) {
    return this.request<{ message: string; store: FleetStore }>("/stores", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updateStore(id: string, payload: FleetStorePayload) {
    return this.request<{ message: string; store: FleetStore }>(`/stores/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async deleteStore(id: string) {
    return this.request<{ message: string }>(`/stores/${id}`, {
      method: "DELETE",
    });
  }

  async getFleetStats() {
    return this.request<FleetStats>("/dashboard/stats");
  }

  async getAccountManager() {
    return this.request<{
      data: { id: string; name: string; email: string; phone: string | null } | null;
    }>("/account-manager");
  }

  async sendEndOfDaySummary() {
    return this.request<{ message: string }>("/dashboard/send-summary", {
      method: "POST",
    });
  }

  // Subscription & Billing
  async getSubscriptionStatus() {
    return this.request<SubscriptionStatus>("/subscription/status");
  }

  async pay(payload: PaymentPayload) {
    return this.request<PaymentResponse>("/subscription/pay", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getReferralStats() {
    return this.request<ReferralStats>("/subscription/referral-stats");
  }

  async validateCoupon(payload: { code: string; plan_name?: string; interval?: string }) {
    return this.request<CouponValidationResponse>("/subscription/validate-coupon", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async verifyPayment(reference: string) {
    return this.request<{ success: boolean; message?: string }>("/subscription/verify", {
      method: "POST",
      body: JSON.stringify({ reference }),
    });
  }

  async getBillingHistory() {
    return this.request<{ transactions: BillingTransaction[] }>("/subscription/billing-history");
  }

  // Notifications
  async getNotifications() {
    return this.request<unknown>("/alerts");
  }

  async markNotificationRead(id: string) {
    return this.request<unknown>(`/alerts/${id}/read`, {
      method: "POST",
    });
  }

  // Online Orders
  async getOnlineOrders() {
    return this.request<{ orders?: OnlineOrder[] }>("/app/online-orders");
  }

  async fulfillOnlineOrder(id: string) {
    return this.request<unknown>(`/app/online-orders/${id}/fulfill`, {
      method: "POST",
      body: JSON.stringify({ status: "fulfilled" }),
    });
  }

  // Danger zone
  async resetData(type: string, password: string) {
    return this.request<{ message: string }>("/dashboard/reset", {
      method: "POST",
      body: JSON.stringify({ type, password }),
    });
  }

  async requestAccountDeletion(payload: { reason: string; password: string }) {
    return this.request<{ message: string }>("/profile/request-deletion", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async cancelAccountDeletion() {
    return this.request<{ message: string }>("/profile/cancel-deletion", {
      method: "POST",
    });
  }
}
