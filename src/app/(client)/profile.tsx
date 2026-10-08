import { useBottomNavHeight } from '@/hooks/use-bottom-nav-height';
import { useClientNavScroll } from '@/hooks/use-client-nav-scroll';
import { useMountedRef } from '@/hooks/use-mounted-ref';
import { useClientProfile } from '@/hooks/use-client-profile';
import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl } from 'react-native';

import { LogoutConfirmationModal } from '@/components/logout-confirmation-modal';
import { showAppAlert } from '@/components/app-alert';
import { signOutPhotoSync } from '@/services/auth';
import { ProfileLoadNotice, ProfileOverview, ProfilePage } from '@/components/client-profile-view';

export default function ProfileScreen() {
  const state = useClientProfile();
  return <ProfileContent key={state.sessionKey} state={state} />;
}

function ProfileContent({ state }: { state: ReturnType<typeof useClientProfile> }) {
  const mounted = useMountedRef();
  const navHeight = useBottomNavHeight();
  const navScroll = useClientNavScroll();
  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleConfirmLogout() {
    if (isSigningOut || !state.isCurrentSession()) {
      return;
    }

    setIsSigningOut(true);
    setIsLogoutModalVisible(false);
    try {
      await signOutPhotoSync();
    } catch {
      if (!mounted.current || !state.isCurrentSession()) return;
      setIsLogoutModalVisible(false);
      showAppAlert('Could not sign out', 'Please try again.');
    } finally {
      if (mounted.current && state.isCurrentSession()) setIsSigningOut(false);
    }
  }

  return (
    <ProfilePage title="My Profile" footerInset={navHeight} navScroll={navScroll}
      refreshControl={<RefreshControl refreshing={!state.isLoading && state.isRefreshing}
        enabled={Boolean(state.accountId) && !isSigningOut}
        onRefresh={() => { if (!isSigningOut) void state.refresh(); }} />}>
      <ProfileLoadNotice error={state.error} isRefreshing={state.isRefreshing}
        onRetry={() => { void state.refresh(); }} />
      <ProfileOverview
        profile={state.profile}
        isLoading={state.isLoading}
        onEdit={() => router.push('/profile/edit')}
        onBookings={() => router.push('/book')}
        onServices={() => router.push('/services')}
        onLogout={() => setIsLogoutModalVisible(true)}
      />
      <LogoutConfirmationModal
        isLoading={isSigningOut}
        onCancel={() => setIsLogoutModalVisible(false)}
        onConfirm={handleConfirmLogout}
        visible={isLogoutModalVisible}
      />
    </ProfilePage>
  );
}
