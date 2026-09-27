import { supabase } from '@/lib/supabase';

export type UserProfile = {
  avatarUrl: string | null;
  email: string;
  fullName: string;
  phone: string;
  role: 'admin' | 'client';
};

export type ProfileFormValues = {
  avatarUrl?: string | null;
  fullName: string;
  phone: string;
};

type ProfileRow = {
  avatar_url?: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: 'admin' | 'client' | null;
};

export async function getMyProfile(): Promise<UserProfile | null> {
  if (!supabase) {
    return null;
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('avatar_url, email, full_name, phone, role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (error || !data) {
    return {
      avatarUrl: null,
      email: userData.user.email ?? '',
      fullName: userData.user.user_metadata?.full_name ?? '',
      phone: '',
      role: 'client',
    };
  }

  return mapProfileRow(data as ProfileRow, userData.user.email ?? '');
}

export async function updateMyProfile(values: ProfileFormValues) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return { message: 'Please log in again before updating your profile.', success: false };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      avatar_url: values.avatarUrl ?? null,
      full_name: values.fullName.trim(),
      phone: values.phone.trim(),
    })
    .eq('id', userData.user.id);

  if (error) {
    return { message: error.message, success: false };
  }

  return { success: true };
}

export async function updateMyPassword(password: string) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { message: error.message, success: false };
  }

  return { success: true };
}

export async function uploadProfileAvatar({
  fileName,
  mimeType,
  uri,
}: {
  fileName?: string | null;
  mimeType?: string | null;
  uri: string;
}) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return { message: 'Please log in again before uploading your photo.', success: false };
  }

  const extension = getFileExtension(fileName, mimeType);
  const path = `${userData.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const response = await fetch(uri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from('profile-images')
    .upload(path, blob, {
      contentType: mimeType ?? `image/${extension}`,
      upsert: false,
    });

  if (error) {
    return { message: error.message, success: false };
  }

  const { data } = supabase.storage.from('profile-images').getPublicUrl(path);

  return { publicUrl: data.publicUrl, success: true };
}

function mapProfileRow(row: ProfileRow, fallbackEmail: string): UserProfile {
  return {
    avatarUrl: row.avatar_url ?? null,
    email: row.email ?? fallbackEmail,
    fullName: row.full_name ?? '',
    phone: row.phone ?? '',
    role: row.role === 'admin' ? 'admin' : 'client',
  };
}

function getFileExtension(fileName?: string | null, mimeType?: string | null) {
  const fileExtension = fileName?.split('.').pop()?.toLowerCase();

  if (fileExtension && fileExtension.length <= 5) {
    return fileExtension === 'jpeg' ? 'jpg' : fileExtension;
  }

  if (mimeType?.includes('/')) {
    const mimeExtension = mimeType.split('/').pop()?.toLowerCase();

    if (mimeExtension) {
      return mimeExtension === 'jpeg' ? 'jpg' : mimeExtension;
    }
  }

  return 'jpg';
}
