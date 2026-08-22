import { QueryClient } from "@tanstack/react-query";

// Singleton so it can be cleared from outside React (e.g. the auth store's
// logout action) as well as provided to the app via QueryClientProvider.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      retry: 1,
    },
  },
});
