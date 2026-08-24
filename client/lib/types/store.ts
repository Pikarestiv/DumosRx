/** Minimal store shape used by the setup/onboarding store picker: both the
 * local `stores` table and the server's `/stores` list return at least these
 * two fields. */
export interface StoreOption {
  id: string;
  name: string;
}
