import { ArrowRightLeft, BadgeCheck, Inbox, LayoutDashboard, ScanLine, Settings, Siren, type LucideIcon } from 'lucide-react';

export type NavKey = 'dashboard' | 'alarms' | 'requests' | 'permits' | 'activity' | 'simulator' | 'settings';

export interface NavItem {
  key: NavKey;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', to: '/admin', icon: LayoutDashboard, end: true },
  { key: 'alarms', to: '/admin/alarms', icon: Siren },
  { key: 'requests', to: '/admin/requests', icon: Inbox },
  { key: 'permits', to: '/admin/permits', icon: BadgeCheck },
  { key: 'activity', to: '/admin/activity', icon: ArrowRightLeft },
  { key: 'simulator', to: '/admin/simulator', icon: ScanLine },
  { key: 'settings', to: '/admin/settings', icon: Settings },
];

/** Nav item for the current path (for the top bar title and the document title). */
export function currentNavKey(pathname: string): NavKey | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin') return 'dashboard';
  const hit = NAV_ITEMS.find((i) => i.key !== 'dashboard' && (path === i.to || path.startsWith(`${i.to}/`)));
  return hit?.key ?? null;
}
