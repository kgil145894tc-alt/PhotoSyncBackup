import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { getMyProfile, updateMyPassword, updateMyProfile, uploadProfileAvatar } from '@/services/profile';
import { profileStyles as styles } from '@/styles/profile.styles';

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [pickedImage, setPickedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [username, setUsername] = useState('');

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      getMyProfile().then((profile) => {
        if (isMounted && profile) {
          setAvatarUrl(profile.avatarUrl);
          setEmail(profile.email);
          setFullName(profile.fullName);
          setPhone(profile.phone);
          setUsername(getUsername(profile.email, profile.fullName));
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

    if (!username.trim()) {
      Alert.alert('Missing username', 'Please enter your username.');
      return;
    }

    if (newPassword || confirmPassword) {
      if (newPassword.length < 6) {
        Alert.alert('Password too short', 'New password must be at least 6 characters.');
        return;
      }

      if (newPassword !== confirmPassword) {
        Alert.alert('Passwords do not match', 'Please confirm your new password.');
        return;
      }
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

    if (!result.success) {
      setIsSaving(false);
      Alert.alert('Profile not saved', result.message ?? 'Please try again.');
      return;
    }

    if (newPassword) {
      const passwordResult = await updateMyPassword(newPassword);

      if (!passwordResult.success) {
        setIsSaving(false);
        Alert.alert('Password not saved', passwordResult.message ?? 'Please try again.');
        return;
      }
    }

    setIsSaving(false);
    Alert.alert('Profile saved', 'Your profile has been updated.');
    router.back();
  }

  const previewSource = pickedImage?.uri ? { uri: pickedImage.uri } : avatarUrl ? { uri: avatarUrl } : null;

  return (
    <View style={styles.editContainer}>
      <StatusBar style="dark" />
      <View style={[styles.editCompactHeader, { paddingTop: insets.top }]}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={() => router.back()} style={styles.editBackButton}>
          <BackIcon />
        </Pressable>
        <EditBrandLogo />
      </View>

      <Image
        contentFit="cover"
        source={require('@/assets/images/booking-empty-background.png')}
        style={styles.editBackgroundImage}
      />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.editContent, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={styles.editScreenTitle}>Edit Profile</Text>
        <Pressable accessibilityRole="button" onPress={pickAvatar} style={styles.editAvatarWrap}>
          {previewSource ? (
            <Image contentFit="cover" source={previewSource} style={styles.editAvatarImage} />
          ) : (
            <EditDefaultAvatar />
          )}
          <View style={styles.editAvatarBadge}>
            <CameraIcon />
          </View>
        </Pressable>

        <Text style={styles.editSectionTitle}>Profile Information</Text>
        <View style={styles.editFormCard}>
          <ProfileInput required label="Full Name" onChangeText={setFullName} value={fullName} />
          <ProfileInput editable={false} keyboardType="email-address" label="Email Address" onChangeText={setEmail} required value={email} />
          <ProfileInput label="Username" onChangeText={setUsername} required value={username} />
          <ProfileInput
            label="New Password (Optional)"
            onChangeText={setNewPassword}
            required
            rightAccessory={
              <Pressable accessibilityLabel={showNewPassword ? 'Hide new password' : 'Show new password'} accessibilityRole="button" hitSlop={10} onPress={() => setShowNewPassword((value) => !value)}>
                <EyeIcon />
              </Pressable>
            }
            secureTextEntry={!showNewPassword}
            value={newPassword}
          />
          <ProfileInput
            label="Confirm New Password (Optional)"
            onChangeText={setConfirmPassword}
            required
            rightAccessory={
              <Pressable accessibilityLabel={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'} accessibilityRole="button" hitSlop={10} onPress={() => setShowConfirmPassword((value) => !value)}>
                <EyeIcon />
              </Pressable>
            }
            secureTextEntry={!showConfirmPassword}
            value={confirmPassword}
          />

          <View style={styles.editButtonRow}>
            <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => router.back()} style={styles.cancelEditButton}>
              <Text style={styles.cancelEditText}>Cancel</Text>
            </Pressable>
          <Pressable
            accessibilityLabel="Save profile"
            accessibilityRole="button"
            disabled={isSaving}
            onPress={handleSave}
            style={({ pressed }) => [styles.saveProfileButton, (pressed || isSaving) && { opacity: 0.78 }]}>
            <Text style={styles.saveProfileText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
          </Pressable>
          </View>
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
  required = false,
  rightAccessory,
  secureTextEntry = false,
  value,
}: {
  editable?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  label: string;
  onChangeText: (value: string) => void;
  required?: boolean;
  rightAccessory?: ReactNode;
  secureTextEntry?: boolean;
  value: string;
}) {
  return (
    <View style={styles.editField}>
      <Text style={styles.editLabel}>{label} {required ? <Text style={styles.requiredMark}>*</Text> : null}</Text>
      <View style={styles.editInputShell}>
        <TextInput
          autoCapitalize={keyboardType === 'email-address' || secureTextEntry ? 'none' : 'words'}
          editable={editable}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={secureTextEntry ? label.replace(' (Optional)', '').toLowerCase().replace('new password', 'Enter new password') : undefined}
          placeholderTextColor="#757575"
          secureTextEntry={secureTextEntry}
          style={[styles.editInput, !editable && styles.editInputDisabled, rightAccessory ? styles.editInputWithAccessory : null]}
          value={value}
        />
        {rightAccessory ? <View style={styles.editInputAccessory}>{rightAccessory}</View> : null}
      </View>
    </View>
  );
}

function EditBrandLogo() {
  return (
    <View style={styles.profileBrandRow}>
      <Text style={styles.editBrandText}>PhotoSync</Text>
      <Image contentFit="contain" source={require('@/assets/images/photosync-logo.png')} style={styles.profileBrandLogo} />
    </View>
  );
}

function EditDefaultAvatar() {
  return (
    <View style={styles.editDefaultAvatar}>
      <View style={styles.editDefaultAvatarHead} />
      <View style={styles.editDefaultAvatarBody} />
    </View>
  );
}

function getUsername(email: string, fullName: string) {
  const emailUsername = email.split('@')[0]?.trim();

  if (emailUsername) {
    return emailUsername;
  }

  return fullName.trim().toLowerCase().replace(/\s+/g, '');
}

function BackIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
    </Svg>
  );
}

function CameraIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M20 7H16.7L15.8 5H8.2L7.3 7H4C3.4 7 3 7.4 3 8V18C3 18.6 3.4 19 4 19H20C20.6 19 21 18.6 21 18V8C21 7.4 20.6 7 20 7Z" fill="#ffffff" />
      <Path d="M12 16C13.7 16 15 14.7 15 13C15 11.3 13.7 10 12 10C10.3 10 9 11.3 9 13C9 14.7 10.3 16 12 16Z" fill="#142C4C" />
    </Svg>
  );
}

function EyeIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M2.5 12C4.5 7.8 7.8 5.7 12 5.7C16.2 5.7 19.5 7.8 21.5 12C19.5 16.2 16.2 18.3 12 18.3C7.8 18.3 4.5 16.2 2.5 12Z" fill="#142C4C" />
      <Path d="M12 15.2C13.8 15.2 15.2 13.8 15.2 12C15.2 10.2 13.8 8.8 12 8.8C10.2 8.8 8.8 10.2 8.8 12C8.8 13.8 10.2 15.2 12 15.2Z" fill="#ffffff" />
    </Svg>
  );
}
