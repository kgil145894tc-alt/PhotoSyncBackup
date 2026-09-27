import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { signOutPhotoSync } from '@/services/auth';
import { getMyProfile, type UserProfile } from '@/services/profile';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { profileStyles as styles } from '@/styles/profile.styles';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      setIsLoading(true);
      getMyProfile().then((item) => {
        if (isMounted) {
          setProfile(item);
          setIsLoading(false);
        }
      });

      return () => {
        isMounted = false;
      };
    }, []),
  );

  const fullName = profile?.fullName || 'PhotoSync Client';
  const email = profile?.email || 'No email available';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={[styles.compactHeader, { paddingTop: insets.top }]}>
        <BrandLogo />
      </View>

      <View style={styles.profileDesignBody}>
        <Image
          contentFit="cover"
          source={require('@/assets/images/booking-empty-background.png')}
          style={styles.profileBackgroundImage}
        />
        <View style={styles.profileAvatarWrap}>
          {profile?.avatarUrl ? (
            <Image contentFit="cover" source={{ uri: profile.avatarUrl }} style={styles.profileAvatarImage} />
          ) : (
            <DefaultAvatar />
          )}
          <View style={styles.profileCameraBadge}>
            <CameraIcon />
          </View>
        </View>

        <Text numberOfLines={1} style={styles.designProfileName}>{isLoading ? 'Loading...' : fullName}</Text>
        <Text numberOfLines={2} style={styles.designProfileEmail}>{email}</Text>

        <View style={styles.designActionStack}>
          <Pressable
            accessibilityLabel="Edit profile"
            accessibilityRole="button"
            onPress={() => router.push('/profile/edit' as never)}
            style={({ pressed }) => [styles.profileMenuRow, pressed && { opacity: 0.84 }]}>
            <View style={styles.profileMenuLeft}>
              <UserIcon />
              <Text style={styles.profileMenuText}>Edit Profile</Text>
            </View>
            <ChevronRight />
          </Pressable>

          <Pressable
            accessibilityLabel="Contact preferences"
            accessibilityRole="button"
            style={({ pressed }) => [styles.profileMenuRow, pressed && { opacity: 0.84 }]}>
            <View style={styles.profileMenuLeft}>
              <BellIcon />
              <Text style={styles.profileMenuText}>Contact Preferences</Text>
            </View>
            <ChevronRight />
          </Pressable>
        </View>

        <View style={[styles.designLogoutWrap, { bottom: bottomNavMetrics.height + insets.bottom + 35 }]}>
          <Pressable
            accessibilityLabel="Log out"
            accessibilityRole="button"
            onPress={async () => {
              await signOutPhotoSync();
              router.replace('/');
            }}
            style={({ pressed }) => [styles.designLogoutButton, pressed && { opacity: 0.82 }]}>
            <LogoutIcon />
            <Text style={styles.designLogoutText}>Logout</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function BrandLogo() {
  return (
    <View style={styles.profileBrandRow}>
      <Text style={styles.profileBrandText}>PhotoSync</Text>
      <Image contentFit="contain" source={require('@/assets/images/photosync-logo.png')} style={styles.profileBrandLogo} />
    </View>
  );
}

function DefaultAvatar() {
  return (
    <View style={styles.defaultAvatar}>
      <View style={styles.defaultAvatarHead} />
      <View style={styles.defaultAvatarBody} />
    </View>
  );
}

function UserIcon() {
  return <PathIcon path="M12 12C14.2 12 16 10.2 16 8C16 5.8 14.2 4 12 4C9.8 4 8 5.8 8 8C8 10.2 9.8 12 12 12ZM5 20C5.8 16.5 8.4 14.5 12 14.5C15.6 14.5 18.2 16.5 19 20" size={18} />;
}

function BellIcon() {
  return <PathIcon path="M18 16V11C18 7.7 15.8 5 12 5C8.2 5 6 7.7 6 11V16L4.5 18H19.5L18 16ZM10 20H14" size={18} />;
}

function CameraIcon() {
  return (
    <Svg width={34} height={34} viewBox="0 0 24 24" fill="none">
      <Path d="M20 7H16.7L15.8 5H8.2L7.3 7H4C3.4 7 3 7.4 3 8V18C3 18.6 3.4 19 4 19H20C20.6 19 21 18.6 21 18V8C21 7.4 20.6 7 20 7Z" fill="#ffffff" />
      <Path d="M12 16C13.7 16 15 14.7 15 13C15 11.3 13.7 10 12 10C10.3 10 9 11.3 9 13C9 14.7 10.3 16 12 16Z" fill="#142C4C" />
    </Svg>
  );
}

function LogoutIcon() {
  return <PathIcon color="#ffffff" path="M10 5H6C5.4 5 5 5.4 5 6V18C5 18.6 5.4 19 6 19H10M14 8L18 12L14 16M18 12H10" size={16} />;
}

function ChevronRight() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5L16 12L9 19" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} />
    </Svg>
  );
}

function PathIcon({ color = '#142C4C', path, size = 23 }: { color?: string; path: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={path} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}
