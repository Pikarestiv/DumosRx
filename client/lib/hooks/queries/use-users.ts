import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
} from "@/lib/db/local-database";
import type { StaffCreatePayload, StaffUpdatePayload } from "@/lib/types/user";

export function useUsers(storeId?: string | null) {
  return useQuery({
    ...queryKeys.staff.users(storeId),
    queryFn: () => getUsers(storeId),
  });
}

export function useMutateUser() {
  const queryClient = useQueryClient();

  // The users key now varies by storeId (see queryKeys.staff.users), so a
  // single mutation must invalidate every store-filtered variant at once;
  // matching on the shared "users" prefix does that.
  const invalidateAllUsers = () =>
    queryClient.invalidateQueries({ queryKey: ["users"] });

  const create = useMutation({
    mutationFn: (data: StaffCreatePayload) => createUser(data),
    onSuccess: invalidateAllUsers,
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: StaffUpdatePayload }) =>
      updateUser(id, data),
    onSuccess: invalidateAllUsers,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: invalidateAllUsers,
  });

  return { create, update, remove };
}
