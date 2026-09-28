import { Image } from "expo-image";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { LogoutConfirmationModal } from "@/components/logout-confirmation-modal";
import { signOutPhotoSync } from "@/services/auth";
import {
  formatBusinessHours,
  formatEditableWorkingTime,
  getStudioSettings,
  parseWorkingTimeInput,
  saveStudioSettings,
  type StudioSettings,
} from "@/services/studio-settings";
import { bottomNavMetrics } from "@/styles/navigation.styles";
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
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [defaultShootLocation, setDefaultShootLocation] = useState("");
  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [lastSavedStudioSettings, setLastSavedStudioSettings] = useState<ComparableStudioSettings | null>(null);
  const [studioAddress, setStudioAddress] = useState("");
  const [studioSettingsNotice, setStudioSettingsNotice] = useState<StudioSettingsNotice | null>(null);
  const [studioName, setStudioName] = useState("PhotoSync Studio");
  const [workingEndTime, setWorkingEndTime] = useState("5:00 PM");
  const [workingStartTime, setWorkingStartTime] = useState("8:00 AM");
  const profileWidth = Math.min(width, 412);
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;

  useEffect(() => {
    let isMounted = true;

    getStudioSettings().then((settings) => {
      if (isMounted) {
        setStudioName(settings.studioName);
        setStudioAddress(settings.studioAddress);
        setContactPhone(settings.contactPhone);
        setContactEmail(settings.contactEmail);
        setDefaultShootLocation(settings.defaultShootLocation);
        setWorkingStartTime(formatEditableWorkingTime(settings.workingStartTime));
        setWorkingEndTime(formatEditableWorkingTime(settings.workingEndTime));
        setLastSavedStudioSettings(normalizeStudioSettingsForComparison(settings));
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSave() {
    if (isSaving) {
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

    if (lastSavedStudioSettings && areStudioSettingsEqual(normalizedSettings, lastSavedStudioSettings)) {
      setStudioSettingsNotice({
        message: "Your studio information is already up to date.",
        title: "No changes to save",
      });
      return;
    }

    setIsSaving(true);
    const result = await saveStudioSettings(settings);
    setIsSaving(false);

    if (!result.success) {
      setStudioSettingsNotice({
        message: result.message ?? "Please try again.",
        title: "Studio settings not saved",
      });
      return;
    }

    setWorkingStartTime(formatEditableWorkingTime(parsedWorkingStartTime));
    setWorkingEndTime(formatEditableWorkingTime(parsedWorkingEndTime));
    setLastSavedStudioSettings(normalizedSettings);

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
    await signOutPhotoSync();
    setIsSigningOut(false);
    setIsLogoutModalVisible(false);
    router.replace("/");
  }

  return (
    <View style={styles.container}>
      <Image
        contentFit="cover"
        source={require("@/assets/images/figma-admin-profile/admin-profile-background.png")}
        style={styles.adminProfileBackgroundImage}
      />
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.adminProfileContent,
          {
            paddingBottom: bottomPadding + 8,
            paddingTop: insets.top + 20,
            width: profileWidth,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.adminProfileScrollView}
      >
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
          <Text style={styles.studioSettingsSubtitle}></Text>

          <StudioInput
            label="Studio Name"
            onChangeText={setStudioName}
            value={studioName}
          />
          <StudioInput
            label="Studio Address"
            multiline
            onChangeText={setStudioAddress}
            value={studioAddress}
          />
          <StudioInput
            keyboardType="phone-pad"
            label="Contact Number"
            onChangeText={setContactPhone}
            value={contactPhone}
          />
          <StudioInput
            keyboardType="email-address"
            label="Contact Email"
            onChangeText={setContactEmail}
            value={contactEmail}
          />
          <StudioInput
            label="Default Shoot Location"
            onChangeText={setDefaultShootLocation}
            placeholder="Example: PhotoSync Studio"
            value={defaultShootLocation}
          />
          <BusinessHoursInput
            endTime={workingEndTime}
            onChangeEndTime={setWorkingEndTime}
            onChangeStartTime={setWorkingStartTime}
            startTime={workingStartTime}
          />

          <Pressable
            accessibilityLabel="Save studio settings"
            accessibilityRole="button"
            disabled={isSaving}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.studioSaveButton,
              (pressed || isSaving) && { opacity: 0.78 },
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
  keyboardType,
  label,
  multiline = false,
  onChangeText,
  placeholder,
  value,
}: {
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
  endTime,
  onChangeEndTime,
  onChangeStartTime,
  startTime,
}: {
  endTime: string;
  onChangeEndTime: (value: string) => void;
  onChangeStartTime: (value: string) => void;
  startTime: string;
}) {
  return (
    <View style={styles.studioField}>
      <Text style={styles.studioFormLabel}>Business Hours</Text>
      <View style={styles.businessHoursInputRow}>
        <TextInput
          onChangeText={onChangeStartTime}
          placeholder="8:00 AM"
          placeholderTextColor="#8AA3C3"
          style={[styles.studioFormInput, styles.businessHoursInput]}
          value={startTime}
        />
        <Text style={styles.businessHoursSeparator}>to</Text>
        <TextInput
          onChangeText={onChangeEndTime}
          placeholder="5:00 PM"
          placeholderTextColor="#8AA3C3"
          style={[styles.studioFormInput, styles.businessHoursInput]}
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
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
      />
      <Path
        d="M14 8L18 12L14 16M18 12H10"
        stroke="#ffffff"
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
