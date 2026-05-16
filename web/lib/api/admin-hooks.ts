import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";

export const useAdminSummary = () => {
  return useQuery({
    queryKey: ["admin-summary"],
    queryFn: () => webApiClient.request<any>("admin/summary"),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useAdminPharmacies = (page = 1, search = "") => {
  return useQuery({
    queryKey: ["admin-pharmacies", page, search],
    queryFn: () => webApiClient.request<any>(`admin/pharmacies?page=${page}${search ? `&search=${search}` : ""}`),
  });
};

export const useAdminProducts = (page = 1, search = "", category = "") => {
  return useQuery({
    queryKey: ["admin-products", page, search, category],
    queryFn: () => webApiClient.request<any>(`admin/products?page=${page}${search ? `&search=${search}` : ""}${category ? `&category=${category}` : ""}`),
  });
};

export const useAdminUsers = (page = 1, search = "") => {
  return useQuery({
    queryKey: ["admin-users", page, search],
    queryFn: () => webApiClient.request<any>(`admin/users?page=${page}${search ? `&search=${search}` : ""}`),
  });
};

export const useAdminHealth = () => {
  return useQuery({
    queryKey: ["admin-health"],
    queryFn: () => webApiClient.request<any>("admin/health"),
    refetchInterval: 30000, // Every 30 seconds
  });
};

export const useStandardizeProductsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => webApiClient.request<any>("admin/products/standardize", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};
