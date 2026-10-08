import { AdminFloatingNav } from '@/components/admin-floating-nav';
import { ClientFloatingNav } from '@/components/client-floating-nav';
import { useBottomNavHeight } from '@/hooks/use-bottom-nav-height';
import { useClientNavAnimation } from '@/hooks/use-client-nav-animation';
import { getTabRouteIndex } from '@/navigation/tab-navigation';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function BottomNav({ pendingCount = null }: { pendingCount?: number | null }) {
  const pathname = usePathname();
  return pathname.startsWith('/photographer') ? <AdminBottomNav pathname={pathname} pendingCount={pendingCount} /> : <ClientBottomNav pathname={pathname} />;
}

function AdminBottomNav({ pathname, pendingCount }: { pathname: string; pendingCount: number | null }) {
  const navHeight = useBottomNavHeight('admin');
  const insets = useSafeAreaInsets();
  const animation = useClientNavAnimation(navHeight, insets.bottom);
  return <AdminFloatingNav currentIndex={getTabRouteIndex(pathname)} height={navHeight}
    {...animation}
    bottomInset={insets.bottom} leftInset={insets.left} rightInset={insets.right}
    pendingCount={pendingCount} onNavigate={(route) => router.push(route as never)} />;
}

function ClientBottomNav({ pathname }: { pathname: string }) {
  const navHeight = useBottomNavHeight();
  const insets = useSafeAreaInsets();
  const animation = useClientNavAnimation(navHeight, insets.bottom);
  return <ClientFloatingNav currentIndex={getTabRouteIndex(pathname)} height={navHeight}
    {...animation}
    bottomInset={insets.bottom} leftInset={insets.left} rightInset={insets.right}
    onNavigate={(route) => router.push(route as never)} />;
}
