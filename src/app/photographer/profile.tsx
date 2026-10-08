import { useBottomNavHeight } from '@/hooks/use-bottom-nav-height';
import { useClientNavScroll as useNavScroll } from '@/hooks/use-client-nav-scroll';
import { useAdminStudioSettings } from '@/hooks/use-admin-studio-settings';
import { useMountedRef } from '@/hooks/use-mounted-ref';
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { LogoutConfirmationModal } from "@/components/logout-confirmation-modal";
import { AdminBrandHeader } from "@/components/admin-brand-header";
import { signOutPhotoSync } from "@/services/auth";
import {
  formatBusinessHours,
  formatEditableWorkingTime,
  parseWorkingTimeInput,
  type StudioSettings,
} from "@/services/studio-settings";
import { photographerStyles as styles } from "@/styles/photographer.styles";

type StudioSettingsNotice = {
  message: string;
  title: string;
};

type ComparableStudioSettings = Pick<
  StudioSettings,
  | "contactEmail"
  | "contactPhone"
  | "defaultShootLocation"
  | "studioAddress"
  | "studioName"
  | "workingEndTime"
  | "workingStartTime"
>;

export default function PhotographerProfileScreen() {
  const studio = useAdminStudioSettings();
  return <PhotographerProfileContent key={`${studio.accountId ?? 'signed-out'}:${studio.sessionKey}`} studio={studio} />;
}

function PhotographerProfileContent({ studio }: { studio: ReturnType<typeof useAdminStudioSettings> }) {
  const { settings: savedSettings, error, isLoading, isRefreshing, isSaving, refresh, save } = studio;
  const mounted = useMountedRef();
  const navHeight = useBottomNavHeight('admin');
  const navScroll = useNavScroll();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [draft, setDraft] = useState<Partial<ComparableStudioSettings>>({});
  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [studioSettingsNotice, setStudioSettingsNotice] = useState<StudioSettingsNotice | null>(null);
  const { contactEmail, contactPhone, defaultShootLocation, studioAddress, studioName, workingEndTime, workingStartTime } = {
    contactEmail: savedSettings?.contactEmail ?? '',
    contactPhone: savedSettings?.contactPhone ?? '',
    defaultShootLocation: savedSettings?.defaultShootLocation ?? '',
    studioAddress: savedSettings?.studioAddress ?? '',
    studioName: savedSettings?.studioName ?? 'PhotoSync Studio',
    workingEndTime: formatEditableWorkingTime(savedSettings?.workingEndTime ?? '17:00:00'),
    workingStartTime: formatEditableWorkingTime(savedSettings?.workingStartTime ?? '08:00:00'),
    ...draft,
  };
  const canEdit = Boolean(savedSettings && studio.accountId && !isSaving && !isSigningOut);
  const profileWidth = Math.min(width, 640);
  const bottomPadding = navHeight + insets.bottom + 24;

  function updateField(field: keyof ComparableStudioSettings, value: string) {
    if (!canEdit) return;
    // Keep only edited fields in the draft. Background reads can update the
    // other fields without replacing text the administrator is typing.
    setDraft((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSave() {
    if (!canEdit || !savedSettings) {
      return;
    }

    if (!studioName.trim()) {
      setStudioSettingsNotice({
        message: "Please enter your studio name.",
        title: "Missing studio name",
      });
      return;
    }

    const parsedWorkingStartTime = parseWorkingTimeInput(workingStartTime);
    const parsedWorkingEndTime = parseWorkingTimeInput(workingEndTime);

    if (!parsedWorkingStartTime || !parsedWorkingEndTime) {
      setStudioSettingsNotice({
        message: "Please enter times like 8:00 AM, 1:30 PM, or 17:00.",
        title: "Check working hours",
      });
      return;
    }

    if (parsedWorkingStartTime >= parsedWorkingEndTime) {
      setStudioSettingsNotice({
        message: "End time must be later than start time.",
        title: "Check working hours",
      });
      return;
    }

    const settings: StudioSettings = {
      businessHours: formatBusinessHours(parsedWorkingStartTime, parsedWorkingEndTime),
      contactEmail,
      contactPhone,
      defaultShootLocation,
      workingEndTime: parsedWorkingEndTime,
      workingStartTime: parsedWorkingStartTime,
      studioAddress,
      studioName,
    };
    const normalizedSettings = normalizeStudioSettingsForComparison(settings);

    if (areStudioSettingsEqual(normalizedSettings, normalizeStudioSettingsForComparison(savedSettings))) {
      setStudioSettingsNotice({
        message: "Your studio information is already up to date.",
        title: "No changes to save",
      });
      return;
    }

    const result = await save(settings);
    if (!mounted.current) return;

    if (!result.success) {
      setStudioSettingsNotice({
        message: result.message ?? "Please try again.",
        title: "Studio settings not saved",
      });
      return;
    }

    setDraft({});

    setStudioSettingsNotice({
      message: "Your studio information has been updated.",
      title: "Studio settings saved",
    });
  }

  async function handleConfirmLogout() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setIsLogoutModalVisible(false);
    try {
      await signOutPhotoSync();
    } catch {
      if (!mounted.current) return;
      setIsLogoutModalVisible(false);
      setStudioSettingsNotice({ title: 'Could not sign out', message: 'Please try again.' });
    } finally {
      if (mounted.current) setIsSigningOut(false);
    }
  }

  return (
    <View style={[styles.container, styles.adminCurvedHeaderScreen]}>
      <StatusBar style="light" />
      <AdminBrandHeader
        textureSource={require("@/assets/images/admin-calendar-banner.png")}
        topInset={insets.top}
      />
      <View style={styles.adminCalendarSurface}>
      <ScrollView
        {...navScroll}
        alwaysBounceVertical
        contentContainerStyle={[
          styles.adminProfileContent,
          {
            paddingBottom: bottomPadding + 8,
            paddingTop: 17,
            width: profileWidth,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { void refresh(); }} />}
        showsVerticalScrollIndicator={false}
        style={styles.adminProfileScrollView}
      >
        <Text style={styles.adminPageTitle}>Profile</Text>
        <Text style={styles.adminPageSubtitle}>Manage your studio information.</Text>
        <View style={styles.simpleProfileHeader}>
          <View style={styles.simpleProfileLogo}>
            <Image
              contentFit="contain"
              source={require("@/assets/images/figma-admin-profile/admin-profile-logo.png")}
              style={styles.adminProfileLogoImage}
            />
            <View style={styles.adminProfileCameraBadge}>
              <CameraBadgeIcon />
            </View>
          </View>
          <Text style={styles.simpleProfileName}>{studioName || "Admin"}</Text>
          <Text style={styles.simpleProfileRole}>Studio Administrator</Text>
        </View>

        <View style={styles.studioSettingsCard}>
          <Text style={styles.studioSettingsTitle}>Studio Information</Text>
          <Text style={styles.studioSettingsSubtitle}>Keep your details up to date for every client session.</Text>

          {isLoading ? <Text style={styles.adminPageSubtitle}>Loading studio information...</Text> : null}
          {error ? <Text style={styles.adminPageSubtitle}>{error}</Text> : null}
          {savedSettings ? (
            <>
              <StudioInput
                editable={canEdit}
                label="Studio Name"
                onChangeText={(value) => updateField('studioName', value)}
                value={studioName}
              />
              <StudioInput
                editable={canEdit}
                label="Studio Address"
                multiline
                onChangeText={(value) => updateField('studioAddress', value)}
                value={studioAddress}
              />
              <Text style={styles.studioSectionHeading}>Client contact</Text>
              <StudioInput
                editable={canEdit}
                keyboardType="phone-pad"
                label="Contact Number"
                onChangeText={(value) => updateField('contactPhone', value)}
                value={contactPhone}
              />
              <StudioInput
                editable={canEdit}
                keyboardType="email-address"
                label="Contact Email"
                onChangeText={(value) => updateField('contactEmail', value)}
                value={contactEmail}
              />
              <Text style={styles.studioSectionHeading}>Session defaults</Text>
              <StudioInput
                editable={canEdit}
                label="Default Shoot Location"
                onChangeText={(value) => updateField('defaultShootLocation', value)}
                placeholder="Example: PhotoSync Studio"
                value={defaultShootLocation}
              />
              <BusinessHoursInput
                editable={canEdit}
                endTime={workingEndTime}
                onChangeEndTime={(value) => updateField('workingEndTime', value)}
                onChangeStartTime={(value) => updateField('workingStartTime', value)}
                startTime={workingStartTime}
              />
            </>
          ) : null}

          <Pressable
            accessibilityLabel="Save studio settings"
            accessibilityRole="button"
            disabled={!canEdit}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.studioSaveButton,
              (pressed || !canEdit) && { opacity: 0.78 },
            ]}
          >
            <Text style={styles.studioSaveText}>
              {isSaving ? "Saving..." : "Save Studio Info"}
            </Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityLabel="Log out"
          accessibilityRole="button"
          disabled={isSigningOut}
          onPress={() => setIsLogoutModalVisible(true)}
          style={({ pressed }) => [
            styles.simpleLogoutButton,
            pressed && { opacity: 0.82 },
          ]}
        >
          <LogoutIcon />
          <Text style={styles.simpleLogoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>
      </View>

      <LogoutConfirmationModal
        isLoading={isSigningOut}
        onCancel={() => setIsLogoutModalVisible(false)}
        onConfirm={handleConfirmLogout}
        visible={isLogoutModalVisible}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setStudioSettingsNotice(null)}
        transparent
        visible={studioSettingsNotice !== null}
      >
        <View style={styles.deleteTimeSlotOverlay}>
          <View style={styles.deleteTimeSlotCard}>
            <Pressable
              accessibilityLabel="Close studio settings notice"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setStudioSettingsNotice(null)}
              style={({ pressed }) => [
                styles.deleteTimeSlotCloseButton,
                pressed && { opacity: 0.72 },
              ]}
            >
              <NoticeCloseIcon />
            </Pressable>
            <StudioSettingsNoticeIcon />
            <Text style={styles.deleteTimeSlotTitle}>
              {studioSettingsNotice?.title}
            </Text>
            <Text style={styles.deleteTimeSlotMessage}>
              {studioSettingsNotice?.message}
            </Text>
            <View style={styles.deleteTimeSlotActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setStudioSettingsNotice(null)}
                style={({ pressed }) => [
                  styles.timeSlotNoticeOkButton,
                  pressed && { opacity: 0.82 },
                ]}
              >
                <Text style={styles.timeSlotNoticeOkText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StudioInput({
  editable,
  keyboardType,
  label,
  multiline = false,
  onChangeText,
  placeholder,
  value,
}: {
  editable: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <View style={styles.studioField}>
      <Text style={styles.studioFormLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        editable={editable}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8AA3C3"
        style={[styles.studioFormInput, multiline && styles.studioAddressInput]}
        value={value}
      />
    </View>
  );
}

function BusinessHoursInput({
  editable,
  endTime,
  onChangeEndTime,
  onChangeStartTime,
  startTime,
}: {
  editable: boolean;
  endTime: string;
  onChangeEndTime: (value: string) => void;
  onChangeStartTime: (value: string) => void;
  startTime: string;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stackHours = width / fontScale < 300;
  return (
    <View style={styles.studioField}>
      <Text style={styles.studioFormLabel}>Business Hours</Text>
      <View style={[styles.businessHoursInputRow, stackHours && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <TextInput
          accessibilityLabel="Business opening time"
          editable={editable}
          onChangeText={onChangeStartTime}
          placeholder="8:00 AM"
          placeholderTextColor="#8AA3C3"
          style={[styles.studioFormInput, styles.businessHoursInput, stackHours && { flex: 0 }]}
          value={startTime}
        />
        <Text style={styles.businessHoursSeparator}>to</Text>
        <TextInput
          accessibilityLabel="Business closing time"
          editable={editable}
          onChangeText={onChangeEndTime}
          placeholder="5:00 PM"
          placeholderTextColor="#8AA3C3"
          style={[styles.studioFormInput, styles.businessHoursInput, stackHours && { flex: 0 }]}
          value={endTime}
        />
      </View>
    </View>
  );
}

function normalizeStudioSettingsForComparison(settings: StudioSettings): ComparableStudioSettings {
  return {
    contactEmail: settings.contactEmail.trim(),
    contactPhone: settings.contactPhone.trim(),
    defaultShootLocation: settings.defaultShootLocation.trim(),
    studioAddress: settings.studioAddress.trim(),
    studioName: settings.studioName.trim(),
    workingEndTime: settings.workingEndTime,
    workingStartTime: settings.workingStartTime,
  };
}

function areStudioSettingsEqual(first: ComparableStudioSettings, second: ComparableStudioSettings) {
  return (
    first.contactEmail === second.contactEmail &&
    first.contactPhone === second.contactPhone &&
    first.defaultShootLocation === second.defaultShootLocation &&
    first.studioAddress === second.studioAddress &&
    first.studioName === second.studioName &&
    first.workingEndTime === second.workingEndTime &&
    first.workingStartTime === second.workingStartTime
  );
}

function LogoutIcon() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 5H6C5.4 5 5 5.4 5 6V18C5 18.6 5.4 19 6 19H10"
        stroke="#B9424B"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
      />
      <Path
        d="M14 8L18 12L14 16M18 12H10"
        stroke="#B9424B"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
      />
    </Svg>
  );
}

function CameraBadgeIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7.6 7.2L8.7 4.8C8.9 4.3 9.4 4 10 4H14C14.6 4 15.1 4.3 15.3 4.8L16.4 7.2H18.2C19.7 7.2 21 8.5 21 10V17.2C21 18.7 19.7 20 18.2 20H5.8C4.3 20 3 18.7 3 17.2V10C3 8.5 4.3 7.2 5.8 7.2H7.6Z"
        fill="#ffffff"
      />
      <Path
        d="M12 17C14.2 17 16 15.2 16 13C16 10.8 14.2 9 12 9C9.8 9 8 10.8 8 13C8 15.2 9.8 17 12 17Z"
        fill="#142C4C"
      />
      <Path
        d="M12 15.2C13.2 15.2 14.2 14.2 14.2 13C14.2 11.8 13.2 10.8 12 10.8C10.8 10.8 9.8 11.8 9.8 13C9.8 14.2 10.8 15.2 12 15.2Z"
        fill="#ffffff"
      />
    </Svg>
  );
}

function StudioSettingsNoticeIcon() {
  return (
    <Svg width={100} height={100} viewBox="0 0 100 100" fill="none">
      <Circle cx={50} cy={50} r={50} fill="#E5EEF9" />
      <Path
        d="M50 28V56"
        stroke="#142C4C"
        strokeLinecap="round"
        strokeWidth={7}
      />
      <Circle cx={50} cy={70} r={4.5} fill="#142C4C" />
    </Svg>
  );
}

function NoticeCloseIcon() {
  return (
    <Svg width={34} height={34} viewBox="0 0 34 34" fill="none">
      <Path d="M11 11L23 23M23 11L11 23" stroke="#142C4C" strokeLinecap="round" strokeWidth={2.4} />
    </Svg>
  );
}
