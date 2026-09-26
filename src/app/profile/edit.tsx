import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { getMyProfile, updateMyProfile, uploadProfileAvatar } from '@/services/profile';
import { profileStyles as styles } from '@/styles/profile.styles';

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [phone, setPhone] = useState('');
  const [pickedImage, setPickedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      getMyProfile().then((profile) => {
        if (isMounted && profile) {
          setAvatarUrl(profile.avatarUrl);
          setEmail(profile.email);
          setFullName(profile.fullName);
          setPhone(profile.phone);
        }
      });

      return () => {
        isMounted = false;
      };
    }, []),
  );

  async function pickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow PhotoSync to choose images from your gallery.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      setPickedImage(result.assets[0]);
    }
  }

  async function handleSave() {
    if (!fullName.trim()) {
      Alert.alert('Missing name', 'Please enter your full name.');
      return;
    }

    setIsSaving(true);
    let nextAvatarUrl = avatarUrl;

    if (pickedImage) {
      const uploadResult = await uploadProfileAvatar({
        fileName: pickedImage.fileName,
        mimeType: pickedImage.mimeType,
        uri: pickedImage.uri,
      });

      if (!uploadResult.success) {
        setIsSaving(false);
        Alert.alert('Photo not uploaded', uploadResult.message ?? 'Please check your Supabase Storage setup.');
        return;
      }

      nextAvatarUrl = uploadResult.publicUrl ?? null;
    }

    const result = await updateMyProfile({
      avatarUrl: nextAvatarUrl,
      fullName,
      phone,
    });

    setIsSaving(false);

    if (!result.success) {
      Alert.alert('Profile not saved', result.message ?? 'Please try again.');
      return;
    }

    Alert.alert('Profile saved', 'Your profile has been updated.');
    router.back();
  }

  const previewSource = pickedImage?.uri ? { uri: pickedImage.uri } : avatarUrl ? { uri: avatarUrl } : null;

  return (
    <View style={styles.editContainer}>
      <StatusBar style="light" />
      <View style={[styles.profileHeader, { paddingTop: insets.top }]}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={() => router.back()} style={styles.editBackButton}>
          <BackIcon />
        </Pressable>
        <Text style={styles.editHeaderTitle}>Edit Profile</Text>
      </View>

      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.editContent, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={pickAvatar} style={styles.editAvatarWrap}>
          {previewSource ? (
            <Image contentFit="cover" source={previewSource} style={styles.editAvatarImage} />
          ) : (
            <Text style={styles.avatarInitials}>{getInitials(fullName || 'P')}</Text>
          )}
          <View style={styles.editAvatarBadge}>
            <CameraIcon />
          </View>
        </Pressable>
        <Text style={styles.editAvatarHint}>Tap photo to change</Text>

        <View style={styles.editFormCard}>
          <ProfileInput label="Full Name" onChangeText={setFullName} value={fullName} />
          <ProfileInput editable={false} keyboardType="email-address" label="Email" onChangeText={setEmail} value={email} />
          <ProfileInput keyboardType="phone-pad" label="Phone Number" onChangeText={setPhone} value={phone} />

          <Pressable
            accessibilityLabel="Save profile"
            accessibilityRole="button"
            disabled={isSaving}
            onPress={handleSave}
            style={({ pressed }) => [styles.saveProfileButton, (pressed || isSaving) && { opacity: 0.78 }]}>
            <Text style={styles.saveProfileText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function ProfileInput({
  editable = true,
  keyboardType,
  label,
  onChangeText,
  value,
}: {
  editable?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.editField}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
        editable={editable}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholderTextColor="#8AA3C3"
        style={[styles.editInput, !editable && styles.editInputDisabled]}
        value={value}
      />
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

function BackIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
    </Svg>
  );
}

function CameraIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M20 7H16.7L15.8 5H8.2L7.3 7H4C3.4 7 3 7.4 3 8V18C3 18.6 3.4 19 4 19H20C20.6 19 21 18.6 21 18V8C21 7.4 20.6 7 20 7Z" stroke="#ffffff" strokeLinejoin="round" strokeWidth={2} />
      <Path d="M12 16C13.7 16 15 14.7 15 13C15 11.3 13.7 10 12 10C10.3 10 9 11.3 9 13C9 14.7 10.3 16 12 16Z" stroke="#ffffff" strokeWidth={2} />
    </Svg>
  );
}
