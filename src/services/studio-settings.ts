import { supabase } from '@/lib/supabase';

export type StudioSettings = {
  businessHours: string;
  contactEmail: string;
  contactPhone: string;
  defaultShootLocation: string;
  studioAddress: string;
  studioName: string;
};

const fallbackStudioSettings: StudioSettings = {
  businessHours: '',
  contactEmail: '',
  contactPhone: '',
  defaultShootLocation: '',
  studioAddress: '',
  studioName: 'PhotoSync Studio',
};

type StudioSettingsRow = {
  business_hours: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  default_shoot_location: string | null;
  studio_address: string | null;
  studio_name: string | null;
};

export async function getStudioSettings(): Promise<StudioSettings> {
  if (!supabase) {
    return fallbackStudioSettings;
  }

  const { data, error } = await supabase
    .from('studio_settings')
    .select('studio_name, studio_address, contact_phone, contact_email, default_shoot_location, business_hours')
    .eq('id', true)
    .maybeSingle();

  if (error || !data) {
    return fallbackStudioSettings;
  }

  return mapStudioSettingsRow(data as StudioSettingsRow);
}

export async function saveStudioSettings(values: StudioSettings) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { error } = await supabase.from('studio_settings').upsert({
    business_hours: values.businessHours.trim() || null,
    contact_email: values.contactEmail.trim() || null,
    contact_phone: values.contactPhone.trim() || null,
    default_shoot_location: values.defaultShootLocation.trim() || null,
    id: true,
    studio_address: values.studioAddress.trim() || null,
    studio_name: values.studioName.trim() || 'PhotoSync Studio',
  });

  if (error) {
    return { message: error.message, success: false };
  }

  return { success: true };
}

function mapStudioSettingsRow(row: StudioSettingsRow): StudioSettings {
  return {
    businessHours: row.business_hours ?? '',
    contactEmail: row.contact_email ?? '',
    contactPhone: row.contact_phone ?? '',
    defaultShootLocation: row.default_shoot_location ?? '',
    studioAddress: row.studio_address ?? '',
    studioName: row.studio_name ?? 'PhotoSync Studio',
  };
}
