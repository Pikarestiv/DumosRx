import { QueryClient } from "@tanstack/react-query";

// Create a singleton instance for use throughout the app (even outside React)
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Local SQLite is fast, but we don't want infinite refetching on window focus 
      // since sync engine handles data invalidation
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 15, // 15 minutes
    },
  },
});
