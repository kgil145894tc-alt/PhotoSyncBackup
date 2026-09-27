import { Image } from "expo-image";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { signOutPhotoSync } from "@/services/auth";
import {
  getStudioSettings,
  saveStudioSettings,
  type StudioSettings,
} from "@/services/studio-settings";
import { bottomNavMetrics } from "@/styles/navigation.styles";
import { photographerStyles as styles } from "@/styles/photographer.styles";

export default function PhotographerProfileScreen() {
  const insets = useSafeAreaInsets();
  const [businessHours, setBusinessHours] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [defaultShootLocation, setDefaultShootLocation] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [studioAddress, setStudioAddress] = useState("");
  const [studioName, setStudioName] = useState("PhotoSync Studio");
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
        setBusinessHours(settings.businessHours);
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
      Alert.alert("Missing studio name", "Please enter your studio name.");
      return;
    }

    const settings: StudioSettings = {
      businessHours,
      contactEmail,
      contactPhone,
      defaultShootLocation,
      studioAddress,
      studioName,
    };

    setIsSaving(true);
    const result = await saveStudioSettings(settings);
    setIsSaving(false);

    if (!result.success) {
      Alert.alert(
        "Studio settings not saved",
        result.message ?? "Please try again.",
      );
      return;
    }

    Alert.alert(
      "Studio settings saved",
      "Your studio information has been updated.",
    );
  }

  return (
    <View style={styles.container}>
      <Image
        contentFit="cover"
        source={require("@/assets/images/admin-calendar-background.png")}
        style={styles.servicesFigmaBackground}
      />
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.adminProfileContent,
          { paddingBottom: bottomPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.simpleProfileHeader}>
          <View style={styles.simpleProfileLogo}>
            <Image
              contentFit="contain"
              source={require("@/assets/images/admin-calendar-logo.png")}
              style={styles.servicesCategoryBrandLogo}
            />
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
          <StudioInput
            label="Business Hours"
            multiline
            onChangeText={setBusinessHours}
            placeholder="Example: Mon-Sat, 8:00 AM - 5:00 PM"
            value={businessHours}
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
          onPress={async () => {
            await signOutPhotoSync();
            router.replace("/");
          }}
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
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8AA3C3"
        style={[styles.formInput, multiline && styles.formTextarea]}
        value={value}
      />
    </View>
  );
}

function CameraLogo() {
  return (
    <Svg width={54} height={44} viewBox="0 0 32 26" fill="none">
      <Path
        d="M28.4 6.2H23.6L22.3 3.2C22 2.5 21.4 2 20.6 2H11.4C10.6 2 10 2.5 9.7 3.2L8.4 6.2H3.6C2.2 6.2 1 7.4 1 8.8V22.4C1 23.8 2.2 25 3.6 25H28.4C29.8 25 31 23.8 31 22.4V8.8C31 7.4 29.8 6.2 28.4 6.2Z"
        stroke="#ffffff"
        strokeLinejoin="round"
        strokeWidth={2.4}
      />
      <Circle cx={16} cy={15.5} r={5.9} stroke="#ffffff" strokeWidth={2.4} />
      <Circle cx={26.2} cy={10.1} r={1.3} fill="#ffffff" />
    </Svg>
  );
}

function LogoutIcon() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 5H6C5.4 5 5 5.4 5 6V18C5 18.6 5.4 19 6 19H10"
        stroke="#E45F62"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
      />
      <Path
        d="M14 8L18 12L14 16M18 12H10"
        stroke="#E45F62"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
      />
    </Svg>
  );
}
