export interface AdminSearchAction {
  id: string;
  title: string;
  type: 'Action' | 'Page';
  href: string;
  icon: string;
  description?: string;
}

export const ADMIN_SEARCH_ACTIONS: AdminSearchAction[] = [
  // Dashboard
  { id: 'dashboard', title: 'Admin Overview', type: 'Page', href: '/admin', icon: 'LayoutDashboard', description: 'Main platform metrics and operations' },
  
  // Pharmacies
  { id: 'view-pharma', title: 'View All Pharmacies', type: 'Page', href: '/admin/pharmacies', icon: 'Store', description: 'List and manage partner pharmacies' },
  { id: 'reg-pharma', title: 'Register New Pharmacy', type: 'Action', href: '/admin/pharmacies/new', icon: 'Plus', description: 'Onboard a new store to the platform' },
  { id: 'pharma-reports', title: 'Pharmacy Revenue Reports', type: 'Page', href: '/admin/pharmacies/reports', icon: 'TrendingUp', description: 'Aggregated financial performance' },
  
  // Users
  { id: 'view-users', title: 'Manage Platform Users', type: 'Page', href: '/admin/users', icon: 'Users', description: 'User accounts and access control' },
  { id: 'admin-roles', title: 'Role Management', type: 'Action', href: '/admin/users/roles', icon: 'ShieldCheck', description: 'Configure permissions and roles' },
  
  // Products
  { id: 'view-products', title: 'Global Product Catalog', type: 'Page', href: '/admin/products', icon: 'Package', description: 'Global medicine and product database' },
  { id: 'new-product', title: 'Add New Global Product', type: 'Action', href: '/admin/products/new', icon: 'Plus', description: 'Create a new product in the global catalog' },
  
  // System & Infrastructure
  { id: 'sys-health', title: 'System Health & Node Status', type: 'Page', href: '/admin/system', icon: 'Server', description: 'Monitor cluster health and node latency' },
  { id: 'audit-logs', title: 'Platform Audit Logs', type: 'Page', href: '/admin/system/logs', icon: 'Activity', description: 'Security and operational logs' },
  { id: 'backup-mgmt', title: 'Backup & Recovery', type: 'Page', href: '/admin/system/backups', icon: 'Database', description: 'Manage automated and manual backups' },
  { id: 'platform-settings', title: 'Global Platform Settings', type: 'Page', href: '/admin/settings', icon: 'Settings', description: 'Configure platform-wide parameters' },
  { id: 'security-config', title: 'Security Configuration', type: 'Action', href: '/admin/settings/security', icon: 'ShieldAlert', description: 'Firewall and encryption settings' },
];
