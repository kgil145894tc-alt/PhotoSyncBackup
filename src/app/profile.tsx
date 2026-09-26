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
  const phone = profile?.phone || 'Add your phone number';

  return (
    <View style={[styles.container, { paddingBottom: bottomNavMetrics.height + insets.bottom + 24 }]}>
      <StatusBar style="light" />
      <View style={styles.profileHeader}>
        <Text style={styles.profileHeaderTitle}>Profile</Text>
      </View>

      <View style={styles.profileSheet}>
        <View style={styles.avatarOuter}>
          {profile?.avatarUrl ? (
            <Image contentFit="cover" source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarInitials}>{getInitials(fullName)}</Text>
          )}
        </View>

        <Text numberOfLines={1} style={styles.profileName}>{isLoading ? 'Loading...' : fullName}</Text>
        <Text style={styles.profileRole}>Client Account</Text>

        <View style={styles.profileInfoCard}>
          <InfoRow icon={<MailIcon />} label="Email" value={email} />
          <InfoRow icon={<PhoneIcon />} label="Phone" value={phone} />
          <InfoRow icon={<UserIcon />} label="Account Type" value="Client" />
        </View>

        <View style={styles.profileActionStack}>
          <Pressable
            accessibilityLabel="Edit profile"
            accessibilityRole="button"
            onPress={() => router.push('/profile/edit' as never)}
            style={({ pressed }) => [styles.editProfileButton, pressed && { opacity: 0.84 }]}>
            <EditIcon />
            <Text style={styles.editProfileText}>Edit Profile</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Log out"
            accessibilityRole="button"
            onPress={async () => {
              await signOutPhotoSync();
              router.replace('/');
            }}
            style={({ pressed }) => [styles.logoutButton, pressed && { opacity: 0.82 }]}>
            <LogoutIcon />
            <Text style={styles.logoutText}>Log Out</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.profileInfoRow}>
      <View style={styles.profileInfoIcon}>{icon}</View>
      <View style={styles.profileInfoCopy}>
        <Text style={styles.profileInfoLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.profileInfoValue}>{value}</Text>
      </View>
    </View>
  );
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P';
}

function MailIcon() {
  return <PathIcon path="M4 7H20V17H4V7ZM5 8.5L12 13.3L19 8.5" />;
}

function PhoneIcon() {
  return <PathIcon path="M7 4L10 7L8.7 9.2C9.8 11.6 12.4 14.2 14.8 15.3L17 14L20 17L18.4 18.6C17.7 19.3 16.7 19.5 15.8 19.1C9.9 16.8 6.2 13.1 3.9 7.2C3.5 6.3 3.7 5.3 4.4 4.6L6 3L7 4Z" />;
}

function UserIcon() {
  return <PathIcon path="M12 12C14.2 12 16 10.2 16 8C16 5.8 14.2 4 12 4C9.8 4 8 5.8 8 8C8 10.2 9.8 12 12 12ZM5 20C5.8 16.5 8.4 14.5 12 14.5C15.6 14.5 18.2 16.5 19 20" />;
}

function EditIcon() {
  return <PathIcon color="#ffffff" path="M5 18.5L5.8 14.5L15.7 4.6C16.5 3.8 17.7 3.8 18.5 4.6L19.4 5.5C20.2 6.3 20.2 7.5 19.4 8.3L9.5 18.2L5 18.5ZM13.8 6.5L17.5 10.2" />;
}

function LogoutIcon() {
  return <PathIcon color="#E45F62" path="M10 5H6C5.4 5 5 5.4 5 6V18C5 18.6 5.4 19 6 19H10M14 8L18 12L14 16M18 12H10" />;
}

function PathIcon({ color = '#142C4C', path }: { color?: string; path: string }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path d={path} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}
