/** The one place the admin panel builds a link to a single store's detail
 * page. The fleet row click, the fleet kebab's "View Store Details" and the
 * dashboard's Recent Stores dialog all route through here so they can never
 * drift apart again (Recent Stores used to deep-link to the fleet list
 * pre-filtered by store id instead of the store itself). */
export const adminStoreDetailPath = (storeId: string) =>
  `/admin/stores/details/?id=${encodeURIComponent(storeId)}`;

export const adminStoreActivityPath = (storeId: string, storeName: string) =>
  `/admin/activity?store_id=${encodeURIComponent(storeId)}&store_name=${encodeURIComponent(storeName)}`;
