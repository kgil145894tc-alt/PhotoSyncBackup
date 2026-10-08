import { Image, type ImageSource } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type ScrollViewProps,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { KeyboardFormScrollView } from '@/components/keyboard-form-scroll-view';
import { type UserProfile } from '@/services/profile';
import type { ClientNavScrollProps } from '@/hooks/use-client-nav-scroll';
import { clientProfileStyles as styles } from '@/styles/client-profile.styles';

export function ProfilePage({
  children,
  title,
  footerInset = 0,
  onBack,
  refreshControl,
  navScroll,
}: {
  children: ReactNode;
  title: string;
  footerInset?: number;
  onBack?: () => void;
  refreshControl?: ScrollViewProps['refreshControl'];
  navScroll?: ClientNavScrollProps;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled={Platform.OS !== 'web'}
    >
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={onBack}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.pressed,
              ]}
            >
              <ProfileIcon name="back" color="#FFFFFF" size={24} />
            </Pressable>
          ) : null}
          <Text style={styles.headerTitle}>{title}</Text>
          {onBack ? <View style={{ width: 44 }} /> : null}
        </View>
      </View>
      <KeyboardFormScrollView
        {...navScroll}
        bounces={Boolean(refreshControl)}
        alwaysBounceVertical={Boolean(refreshControl)}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: footerInset + insets.bottom + 28 },
        ]}
      >
        {children}
      </KeyboardFormScrollView>
    </KeyboardAvoidingView>
  );
}

export function ProfileLoadNotice({ error, isRefreshing, onRetry }: {
  error: string | null;
  isRefreshing: boolean;
  onRetry: () => void;
}) {
  if (!error) return null;
  return (
    <View style={[styles.card, { paddingVertical: 12 }]}>
      <Text accessibilityRole="alert" style={styles.helper}>{error}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry loading profile"
        disabled={isRefreshing} onPress={onRetry}
        style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center' }, pressed && styles.pressed]}>
        <Text style={styles.photoButtonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export function ProfileOverview({
  profile,
  isLoading,
  onEdit,
  onBookings,
  onServices,
  onLogout,
}: {
  profile: UserProfile | null;
  isLoading: boolean;
  onEdit: () => void;
  onBookings: () => void;
  onServices: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <View style={styles.identityCard}>
        <ProfileAvatar
          source={profile?.avatarUrl ? { uri: profile.avatarUrl } : null}
        />
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>PhotoSync Client</Text>
        </View>
        {isLoading ? (
          <View accessibilityLabel="Loading profile" style={styles.skeleton} />
        ) : (
          <Text style={styles.name}>
            {profile?.fullName || (profile ? 'PhotoSync Client' : 'Profile unavailable')}
          </Text>
        )}
        <Text style={styles.email}>
          {profile?.email ||
            (isLoading
              ? 'Your account details are on their way.'
              : profile ? 'No email available' : 'Your account details could not be loaded.')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          disabled={!profile}
          onPress={onEdit}
          style={({ pressed }) => [
            styles.editButton,
            !profile && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <ProfileIcon name="edit" color="#FFFFFF" size={18} />
          <Text style={styles.buttonText}>Edit Profile</Text>
        </Pressable>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account details</Text>
        <View style={styles.card}>
          <AccountRow
            icon="user"
            label="Username"
            value={
              profile?.username ? `@${profile.username}` : profile ? 'Add a username' : 'Unavailable'
            }
            isLoading={isLoading}
          />
          <AccountRow
            icon="mail"
            label="Email address"
            value={profile?.email || (profile ? 'No email available' : 'Unavailable')}
            isLoading={isLoading}
          />
          <AccountRow
            icon="phone"
            label="Phone number"
            value={profile?.phone || (profile ? 'Add a phone number' : 'Unavailable')}
            isLoading={isLoading}
            last
          />
        </View>
      </View>
      <View style={styles.card}>
        <Pressable
          accessibilityRole="button"
          onPress={onBookings}
          style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
        >
          <View style={styles.iconTile}>
            <ProfileIcon name="calendar" size={20} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.menuTitle}>My Bookings</Text>
            <Text style={styles.helper}>Your sessions and studio updates</Text>
          </View>
          <ProfileIcon name="arrow" size={18} />
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Explore photography services"
        onPress={onServices}
        style={({ pressed }) => [styles.featureCard, pressed && styles.pressed]}
      >
        <Image
          contentFit="cover"
          source={require('@/assets/images/about/about-studio-visit.png')}
          style={styles.featureImage}
        />
        <View style={styles.featureOverlay} />
        <View style={styles.featureCopy}>
          <Text style={styles.featureEyebrow}>MAKE MORE MEMORIES</Text>
          <Text style={styles.featureTitle}>Ready for your next story?</Text>
          <View style={styles.featureLink}>
            <Text style={styles.featureLinkText}>Explore our services</Text>
            <ProfileIcon name="arrow" color="#FFFFFF" size={18} />
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log out"
        onPress={onLogout}
        style={({ pressed }) => [
          styles.logoutButton,
          pressed && styles.pressed,
        ]}
      >
        <ProfileIcon name="logout" color="#963E37" size={20} />
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </>
  );
}

function AccountRow({
  icon,
  label,
  value,
  last = false,
  isLoading,
}: {
  icon: ProfileIconName;
  label: string;
  value: string;
  last?: boolean;
  isLoading: boolean;
}) {
  return (
    <View style={[styles.accountRow, !last && styles.divider]}>
      <View style={styles.iconTile}>
        <ProfileIcon name={icon} size={20} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {isLoading ? (
          <View style={styles.skeleton} />
        ) : (
          <Text style={styles.value}>{value}</Text>
        )}
      </View>
    </View>
  );
}

export type ProfileEditorValues = {
  fullName: string;
  email: string;
  username: string;
  phone: string;
  newPassword: string;
  confirmPassword: string;
};
export function ProfileEditor({
  values,
  avatarSource,
  isSaving,
  isLoading,
  isUnavailable = false,
  onChange,
  onPickAvatar,
  onSave,
  onCancel,
}: {
  values: ProfileEditorValues;
  avatarSource: ImageSource | null;
  isSaving: boolean;
  isLoading: boolean;
  isUnavailable?: boolean;
  onChange: (field: keyof ProfileEditorValues, value: string) => void;
  onPickAvatar: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const disabled = isSaving || isLoading || isUnavailable;
  return (
    <>
      <Text style={styles.helper}>
        Keep your details up to date for your next photo session.
      </Text>
      <View style={styles.photoCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          disabled={disabled}
          onPress={onPickAvatar}
          style={({ pressed }) => [
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          <ProfileAvatar source={avatarSource} />
          <View style={styles.cameraBadge}>
            <ProfileIcon name="camera" color="#FFFFFF" size={16} />
          </View>
        </Pressable>
        <View style={styles.photoCopy}>
          <Text style={styles.sectionTitle}>Profile photo</Text>
          <Text style={styles.helper}>Choose a photo that feels like you.</Text>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onPickAvatar}
            style={({ pressed }) => [
              styles.photoButton,
              disabled && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.photoButtonText}>Change photo</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.formCard}>
        <View style={styles.sectionHeading}>
          <ProfileIcon name="user" size={20} />
          <Text style={styles.sectionTitle}>Personal information</Text>
        </View>
        <ProfileField
          label="Full name"
          required
          value={values.fullName}
          onChangeText={(value) => onChange('fullName', value)}
          placeholder="Your full name"
          editable={!disabled}
          autoCapitalize="words"
          autoComplete="name"
        />
        <ProfileField
          label="Username"
          required
          value={values.username}
          onChangeText={(value) => onChange('username', value)}
          placeholder="Your username"
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <ProfileField
          label="Phone number"
          value={values.phone}
          onChangeText={(value) => onChange('phone', value)}
          placeholder="Add a phone number"
          editable={!disabled}
          keyboardType="phone-pad"
          autoComplete="tel"
          helper="Optional. A number the studio can reach you on."
        />
      </View>
      <View style={styles.formCard}>
        <View style={styles.sectionHeading}>
          <ProfileIcon name="mail" size={20} />
          <Text style={styles.sectionTitle}>Account email</Text>
        </View>
        <ProfileField
          label="Email address"
          value={values.email}
          editable={false}
          keyboardType="email-address"
          helper="Your sign-in email is shown for reference and cannot be edited here."
        />
      </View>
      <View style={styles.formCard}>
        <View style={styles.sectionHeading}>
          <ProfileIcon name="lock" size={20} />
          <Text style={styles.sectionTitle}>Change password</Text>
        </View>
        <View style={styles.optionalBadge}>
          <Text style={styles.label}>Optional</Text>
        </View>
        <Text style={styles.helper}>
          Leave both fields blank to keep your current password.
        </Text>
        <ProfileField
          label="New password"
          value={values.newPassword}
          onChangeText={(value) => onChange('newPassword', value)}
          placeholder="At least 6 characters"
          editable={!disabled}
          secureTextEntry={!showNewPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          accessory={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showNewPassword ? 'Hide new password' : 'Show new password'
              }
              disabled={disabled}
              onPress={() => setShowNewPassword((value) => !value)}
              style={styles.inputAccessory}
            >
              <ProfileIcon
                name={showNewPassword ? 'eyeOff' : 'eye'}
                size={21}
              />
            </Pressable>
          }
        />
        <ProfileField
          label="Confirm new password"
          value={values.confirmPassword}
          onChangeText={(value) => onChange('confirmPassword', value)}
          placeholder="Re-enter your new password"
          editable={!disabled}
          secureTextEntry={!showConfirmPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          accessory={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showConfirmPassword
                  ? 'Hide confirmed password'
                  : 'Show confirmed password'
              }
              disabled={disabled}
              onPress={() => setShowConfirmPassword((value) => !value)}
              style={styles.inputAccessory}
            >
              <ProfileIcon
                name={showConfirmPassword ? 'eyeOff' : 'eye'}
                size={21}
              />
            </Pressable>
          }
        />
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={onCancel}
          style={({ pressed }) => [
            styles.cancelButton,
            isSaving && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save profile"
          disabled={disabled}
          onPress={onSave}
          style={({ pressed }) => [
            styles.saveButton,
            disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.buttonText}>
            {isSaving
              ? 'Saving...'
              : isLoading
                ? 'Loading profile...'
                : isUnavailable ? 'Profile unavailable' : 'Save Changes'}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

function ProfileField({
  label,
  required,
  helper,
  accessory,
  ...props
}: TextInputProps & {
  label: string;
  required?: boolean;
  helper?: string;
  accessory?: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      <View
        style={[
          styles.inputShell,
          props.editable === false && styles.disabledInput,
          focused && styles.focusedInput,
        ]}
      >
        <TextInput
          {...props}
          accessibilityLabel={label}
          placeholderTextColor="#738197"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.input}
        />
        {accessory}
      </View>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

function ProfileAvatar({ source }: { source: ImageSource | null }) {
  return (
    <View style={styles.avatar}>
      {source ? (
        <Image source={source} contentFit="cover" style={styles.avatarImage} />
      ) : (
        <ProfileIcon name="user" size={44} color="#6383A4" />
      )}
    </View>
  );
}

type ProfileIconName =
  | 'arrow'
  | 'back'
  | 'calendar'
  | 'camera'
  | 'edit'
  | 'eye'
  | 'eyeOff'
  | 'lock'
  | 'logout'
  | 'mail'
  | 'phone'
  | 'user';
function ProfileIcon({
  name,
  size = 20,
  color = '#142C4C',
}: {
  name: ProfileIconName;
  size?: number;
  color?: string;
}) {
  const paths: Record<ProfileIconName, string> = {
    arrow: 'M5 12H19M13 6L19 12L13 18',
    back: 'M15 5L8 12L15 19',
    calendar:
      'M7 3V7M17 3V7M4 10H20M5 5H19Q20 5 20 6V20Q20 21 19 21H5Q4 21 4 20V6Q4 5 5 5M8 14H10M14 14H16',
    camera:
      'M8 6L10 3H14L16 6H20Q22 6 22 8V19Q22 21 20 21H4Q2 21 2 19V8Q2 6 4 6ZM16 13A4 4 0 1 1 8 13A4 4 0 1 1 16 13',
    edit: 'M14 5L19 10M4 20L9 19L21 7Q22 6 21 5L19 3Q18 2 17 3L5 15ZM4 20L5 15',
    eye: 'M2 12C7 3 17 3 22 12C17 21 7 21 2 12ZM15 12A3 3 0 1 1 9 12A3 3 0 1 1 15 12',
    eyeOff:
      'M3 3L21 21M9 6C14 4 19 7 22 12L19 16M6 7L2 12C5 18 11 20 16 18M10 10L14 14',
    lock: 'M7 10V7A5 5 0 0 1 17 7V10M6 10H18Q20 10 20 12V20Q20 22 18 22H6Q4 22 4 20V12Q4 10 6 10M12 15V18',
    logout: 'M10 5H5Q4 5 4 6V18Q4 19 5 19H10M15 8L19 12L15 16M19 12H9',
    mail: 'M4 5H20Q22 5 22 7V17Q22 19 20 19H4Q2 19 2 17V7Q2 5 4 5ZM3 6L12 13L21 6',
    phone: 'M7 3L10 8L8 10C9 13 11 15 14 16L16 14L21 17L20 21C10 23 1 14 3 4Z',
    user: 'M16 7A4 4 0 1 1 8 7A4 4 0 1 1 16 7M4 21V19C4 15 8 13 12 13C16 13 20 15 20 19V21',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
