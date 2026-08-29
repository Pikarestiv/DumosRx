/**
 * Standalone holder for the admin panel's in-memory access token - zero
 * imports on purpose. base-client.ts and logger.ts need to read this token,
 * but importing use-admin-auth-store.ts directly from either creates a
 * cycle (base-client -> use-admin-auth-store -> client.ts -> base-client),
 * which breaks client.ts's `export default apiClient` with a real
 * "Cannot access 'apiClient' before initialization" TDZ crash at module
 * load. use-admin-auth-store.ts calls setAdminToken() everywhere it calls
 * zustand's own setToken(), keeping the two in sync without either module
 * importing the other.
 */
let token: string | null = null;

export const getAdminToken = () => token;
export const setAdminToken = (value: string | null) => {
  token = value;
};
