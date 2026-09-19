import {
  LayoutDashboard, Wallet, Tags, ArrowLeftRight, Users as UsersIcon,
  Scale, Upload, Database, BarChart3, HelpCircle,
} from 'lucide-react'

export type View =
  | 'dashboard' | 'accounts' | 'categories' | 'transactions' | 'users'
  | 'split-settings' | 'import' | 'backup' | 'charts' | 'help'

export const viewLabels: Record<View, string> = {
  dashboard: 'Dashboard',
  accounts: 'Accounts',
  categories: 'Categories',
  transactions: 'Transactions',
  users: 'Users',
  'split-settings': 'Split Weights',
  import: 'Import CSV',
  backup: 'Backup & Restore',
  charts: 'Charts',
  help: 'Help',
}

export const viewIcons: Record<View, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  accounts: Wallet,
  categories: Tags,
  transactions: ArrowLeftRight,
  users: UsersIcon,
  'split-settings': Scale,
  import: Upload,
  backup: Database,
  charts: BarChart3,
  help: HelpCircle,
}

// The 4 views that get a permanent, always-visible slot in the nav (bottom
// tab bar on mobile, top bar on desktop); everything else lives behind "More".
export const PRIMARY_VIEWS: View[] = ['dashboard', 'transactions', 'accounts', 'charts']
export const MORE_VIEWS: View[] = ['categories', 'users', 'split-settings', 'import', 'backup', 'help']
