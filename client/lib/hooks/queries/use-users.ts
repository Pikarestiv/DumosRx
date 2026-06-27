import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
} from "@/lib/db/local-database";

export function useUsers(storeId?: string | null) {
  return useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => {
      // If storeId is provided, local-database expects it or we just fetch all
      // For now, getUsers in local-database doesn't take storeId natively if it just returns all,
      // but we should pass it if required. We'll just call getUsers().
      return getUsers(storeId);
    },
  });
}

export function useMutateUser() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (data: any) => createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users() });
      queryClient.invalidateQueries({ queryKey: ["localData"] });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users() });
      queryClient.invalidateQueries({ queryKey: ["localData"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users() });
      queryClient.invalidateQueries({ queryKey: ["localData"] });
    },
  });

  return { create, update, remove };
}
