import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { RefreshControl } from 'react-native';

import { showAppAlert } from '@/components/app-alert';
import { ProfileEditor, ProfileLoadNotice, ProfilePage, type ProfileEditorValues } from '@/components/client-profile-view';
import { useClientProfile } from '@/hooks/use-client-profile';
import { useMountedRef } from '@/hooks/use-mounted-ref';
import { updateMyPassword, uploadProfileAvatar } from '@/services/profile';

export default function EditProfileScreen() {
  const state = useClientProfile();
  return <EditProfileContent key={state.sessionKey} state={state} />;
}

function EditProfileContent({ state }: { state: ReturnType<typeof useClientProfile> }) {
  const mounted = useMountedRef();
  const [draft, setDraft] = useState<Partial<Omit<ProfileEditorValues, 'email'>>>({});
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | undefined>(undefined);
  const [pickedImage, setPickedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const saving = useRef(false);
  const picking = useRef(false);
  const isSaving = isWorking || state.isSaving;
  const canEdit = Boolean(state.accountId && state.profile && !isSaving);
  const stillHere = () => mounted.current && state.isCurrentSession();
  // Only edited fields live in the draft. Background reads update untouched
  // fields without replacing typed text, passwords, or the selected photo.
  const values: ProfileEditorValues = {
    fullName: state.profile?.fullName ?? '', username: state.profile?.username ?? '',
    phone: state.profile?.phone ?? '', newPassword: '', confirmPassword: '',
    ...draft, email: state.profile?.email ?? '',
  };
  const avatarUrl = uploadedAvatarUrl ?? state.profile?.avatarUrl ?? null;

  async function pickAvatar() {
    if (!canEdit || saving.current || picking.current || !stillHere()) return;
    picking.current = true;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!stillHere()) return;
      if (!permission.granted) {
        showAppAlert('Permission needed', 'Please allow PhotoSync to choose images from your gallery.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'], quality: 0.85,
      });
      if (stillHere() && !saving.current && !result.canceled && result.assets[0]) setPickedImage(result.assets[0]);
    } catch {
      if (stillHere()) showAppAlert('Photo not selected', 'Please try choosing your photo again.');
    } finally {
      picking.current = false;
    }
  }

  async function handleSave() {
    if (!canEdit || saving.current || picking.current || !state.accountId || !stillHere()) return;
    const { fullName, username, phone, newPassword, confirmPassword } = values;
    if (!fullName.trim()) {
      showAppAlert('Missing name', 'Please enter your full name.');
      return;
    }
    if (!username.trim()) {
      showAppAlert('Missing username', 'Please enter your username.');
      return;
    }
    if (newPassword || confirmPassword) {
      if (newPassword.length < 6) {
        showAppAlert('Password too short', 'New password must be at least 6 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        showAppAlert('Passwords do not match', 'Please confirm your new password.');
        return;
      }
    }

    saving.current = true;
    setIsWorking(true);
    const session = { expectedAccountId: state.accountId, isSessionCurrent: state.isCurrentSession };
    let profileWasSaved = false;
    try {
      let nextAvatarUrl = avatarUrl;
      if (pickedImage) {
        const uploadResult = await uploadProfileAvatar({
          fileName: pickedImage.fileName, mimeType: pickedImage.mimeType, uri: pickedImage.uri,
        }, session);
        if (!state.isCurrentSession()) return;
        if (!uploadResult.success || !uploadResult.publicUrl) {
          if (stillHere()) showAppAlert('Photo not uploaded', uploadResult.message ?? 'Please try again.');
          return;
        }
        nextAvatarUrl = uploadResult.publicUrl;
        if (stillHere()) {
          // A failed profile write can retry the already uploaded photo.
          setUploadedAvatarUrl(nextAvatarUrl);
          setPickedImage(null);
        }
      }

      const result = await state.save({ avatarUrl: nextAvatarUrl, fullName, phone, username });
      if (!state.isCurrentSession()) return;
      profileWasSaved = Boolean(result.profile);
      if (!result.success) {
        if (stillHere()) showAppAlert(result.profile ? 'Profile saved with an issue' : 'Profile not saved', result.message);
        return;
      }
      if (newPassword) {
        const passwordResult = await updateMyPassword(newPassword, session);
        if (!state.isCurrentSession()) return;
        if (!passwordResult.success) {
          if (stillHere()) showAppAlert('Password not saved',
            `Your profile was saved, but your password was not updated. ${passwordResult.message ?? 'Please try again.'}`);
          return;
        }
      }
      if (!stillHere()) return;
      setDraft({});
      setUploadedAvatarUrl(undefined);
      showAppAlert('Profile saved', 'Your profile has been updated.');
      router.back();
    } catch {
      if (stillHere()) showAppAlert(profileWasSaved ? 'Password not saved' : 'Profile not saved', profileWasSaved
        ? 'Your profile was saved, but your password could not be updated. Please try again.'
        : 'Could not save your profile. Please try again.');
    } finally {
      saving.current = false;
      if (stillHere()) setIsWorking(false);
    }
  }

  function handleFieldChange(field: keyof ProfileEditorValues, value: string) {
    if (!canEdit || saving.current || field === 'email' || !state.isCurrentSession()) return;
    setDraft((previous) => ({ ...previous, [field]: value }));
  }

  function goBack() { if (!saving.current && !isSaving && state.isCurrentSession()) router.back(); }
  function refresh() { if (!saving.current && !isSaving) void state.refresh(); }
  return (
    <ProfilePage title="Edit Profile" onBack={goBack}
      refreshControl={<RefreshControl refreshing={!state.isLoading && state.isRefreshing}
        enabled={Boolean(state.accountId) && !isSaving} onRefresh={refresh} />}>
      <ProfileLoadNotice error={state.error} isRefreshing={state.isRefreshing || isSaving} onRetry={refresh} />
      <ProfileEditor values={values}
        avatarSource={pickedImage?.uri ? { uri: pickedImage.uri } : avatarUrl ? { uri: avatarUrl } : null}
        isSaving={isSaving} isLoading={state.isLoading} isUnavailable={!state.profile || !state.accountId}
        onChange={handleFieldChange} onPickAvatar={pickAvatar} onSave={handleSave} onCancel={goBack} />
    </ProfilePage>
  );
}
