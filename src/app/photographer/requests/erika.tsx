import { useBottomNavHeight } from '@/hooks/use-bottom-nav-height';
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { photographerStyles as styles } from "@/styles/photographer.styles";

export default function PhotographerRequestDetailScreen() {
  const navHeight = useBottomNavHeight('admin');
  const insets = useSafeAreaInsets();
  const bottomPadding = navHeight + insets.bottom + 24;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.requestDetailContent,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailTopBar}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.detailIconButton}
          >
            <BackIcon />
          </Pressable>
          <View style={styles.detailBrand}>
            <Text style={styles.detailBrandText}>PhotoSync</Text>
            <CameraIcon />
          </View>
          <Pressable
            accessibilityLabel="More options"
            accessibilityRole="button"
            style={styles.detailIconButton}
          >
            <MoreIcon />
          </Pressable>
        </View>

        <View style={styles.detailPendingPill}>
          <Text style={styles.detailPendingText}>Pending</Text>
        </View>

        <View style={styles.clientHeaderRow}>
          <View style={styles.detailAvatar}>
            <Text style={styles.detailAvatarText}>E</Text>
          </View>
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>Erika Gonzales</Text>
            <View style={styles.clientInfoRow}>
              <PhoneIcon />
              <Text style={styles.clientMeta}>0933 222 1111</Text>
            </View>
            <View style={styles.clientInfoRow}>
              <MailIcon />
              <Text style={styles.clientMeta}>erika@gmail.com</Text>
            </View>
          </View>
        </View>

        <Text style={styles.detailSectionTitle}>Requested Service</Text>
        <View style={styles.serviceDetailRow}>
          <View style={styles.serviceImagePlaceholder}>
            <CameraIcon />
          </View>
          <View style={styles.serviceDetailCopy}>
            <Text style={styles.serviceDetailTitle}>
              Couple Portrait Package
            </Text>
            <Text style={styles.serviceDetailPrice}>₱800</Text>
            {[
              "1 - 1.5 hour session",
              "Portrait copies",
              "70 edited photos",
              "Soft copy (high-resolution)",
            ].map((item) => (
              <Text key={item} style={styles.serviceBullet}>
                • {item}
              </Text>
            ))}
          </View>
        </View>

        <Text style={styles.detailSectionTitle}>Preferred Date & Time</Text>
        <View style={styles.dateTimeRow}>
          <View style={styles.dateTimePill}>
            <CalendarSmallIcon />
            <Text style={styles.dateTimeText}>October 3, 2026</Text>
          </View>
          <View style={styles.dateTimePill}>
            <ClockIcon />
            <Text style={styles.dateTimeText}>1:30 PM - 3:30 PM</Text>
          </View>
        </View>

        <Text style={styles.detailSectionTitle}>Additional Notes</Text>
        <View style={styles.notesBox}>
          <Text style={styles.notesText}>
            We would like a garden theme if possible. Please let me know if you
            have available dates. Thank you!
          </Text>
        </View>

        <View style={styles.detailActionRow}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.rejectButton,
              pressed && { opacity: 0.82 },
            ]}
          >
            <Text style={styles.rejectButtonText}>Reject Request</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.confirmButton,
              pressed && { opacity: 0.82 },
            ]}
          >
            <Text style={styles.confirmButtonText}>Confirm Request</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function BackIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 5L8 12L15 19"
        stroke="#142C4C"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3}
      />
    </Svg>
  );
}

function MoreIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={5} r={1.8} fill="#142C4C" />
      <Circle cx={12} cy={12} r={1.8} fill="#142C4C" />
      <Circle cx={12} cy={19} r={1.8} fill="#142C4C" />
    </Svg>
  );
}

function CameraIcon() {
  return (
    <Svg width={30} height={24} viewBox="0 0 30 24" fill="none">
      <Path
        d="M26.3 5.7H21.8L20.6 3C20.4 2.5 19.9 2.2 19.4 2.2H10.6C10.1 2.2 9.6 2.5 9.4 3L8.2 5.7H3.7C2.5 5.7 1.5 6.7 1.5 7.9V20.1C1.5 21.3 2.5 22.3 3.7 22.3H26.3C27.5 22.3 28.5 21.3 28.5 20.1V7.9C28.5 6.7 27.5 5.7 26.3 5.7Z"
        stroke="#142C4C"
        strokeLinejoin="round"
        strokeWidth={2.2}
      />
      <Circle cx={15} cy={14} r={5} stroke="#142C4C" strokeWidth={2.2} />
    </Svg>
  );
}

function PhoneIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 4L10 7L8.7 9.2C9.8 11.6 12.4 14.2 14.8 15.3L17 14L20 17C20.4 17.4 20.4 18 20 18.4L18.5 19.9C17.8 20.6 16.8 20.8 15.9 20.4C9.9 18.1 5.9 14.1 3.6 8.1C3.2 7.2 3.4 6.2 4.1 5.5L5.6 4C6 3.6 6.6 3.6 7 4Z"
        stroke="#8AA3C3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function MailIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3}
        y={6}
        width={18}
        height={12}
        rx={2}
        stroke="#8AA3C3"
        strokeWidth={2}
      />
      <Path
        d="M4.5 8L12 13.5L19.5 8"
        stroke="#8AA3C3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function CalendarSmallIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect
        x={4}
        y={5.5}
        width={16}
        height={14}
        rx={2}
        stroke="#8AA3C3"
        strokeWidth={2}
      />
      <Path
        d="M8 3.5V7M16 3.5V7M4 10H20"
        stroke="#8AA3C3"
        strokeLinecap="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function ClockIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke="#8AA3C3" strokeWidth={2} />
      <Path
        d="M12 7.5V12L15 14"
        stroke="#8AA3C3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}
