import { supabase } from '@/lib/supabase';

export type StudioSettings = {
  businessHours: string;
  contactEmail: string;
  contactPhone: string;
  defaultShootLocation: string;
  workingEndTime: string;
  workingStartTime: string;
  studioAddress: string;
  studioName: string;
};

export type WorkingHoursWindow = {
  endTime: string;
  startTime: string;
};

export const fallbackWorkingHoursWindow: WorkingHoursWindow = {
  endTime: '17:00:00',
  startTime: '08:00:00',
};

const fallbackStudioSettings: StudioSettings = {
  businessHours: '',
  contactEmail: '',
  contactPhone: '',
  defaultShootLocation: '',
  workingEndTime: fallbackWorkingHoursWindow.endTime,
  workingStartTime: fallbackWorkingHoursWindow.startTime,
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

export async function getDefaultWorkingHoursWindow(): Promise<WorkingHoursWindow> {
  const settings = await getStudioSettings();

  return getWorkingHoursWindowFromBusinessHours(settings.businessHours);
}

export async function saveStudioSettings(values: StudioSettings) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const businessHours = formatBusinessHours(values.workingStartTime, values.workingEndTime);
  const { error } = await supabase.from('studio_settings').upsert({
    business_hours: businessHours,
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
  const workingWindow = getWorkingHoursWindowFromBusinessHours(row.business_hours ?? '');

  return {
    businessHours: row.business_hours ?? '',
    contactEmail: row.contact_email ?? '',
    contactPhone: row.contact_phone ?? '',
    defaultShootLocation: row.default_shoot_location ?? '',
    workingEndTime: workingWindow.endTime,
    workingStartTime: workingWindow.startTime,
    studioAddress: row.studio_address ?? '',
    studioName: row.studio_name ?? 'PhotoSync Studio',
  };
}

export function formatBusinessHours(startTime: string, endTime: string) {
  return `Mon-Sat, ${formatDisplayTime(startTime)} - ${formatDisplayTime(endTime)}`;
}

export function formatDisplayTime(value: string) {
  const [hourText = '0', minuteText = '0'] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

export function formatEditableWorkingTime(value: string) {
  return formatDisplayTime(value);
}

export function parseWorkingTimeInput(value: string) {
  const trimmedValue = value.trim().toUpperCase();
  const match = trimmedValue.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  const period = match[3];

  if (minute > 59 || hour > 23 || hour < 0) {
    return null;
  }

  if (period) {
    if (hour < 1 || hour > 12) {
      return null;
    }

    if (period === 'PM' && hour !== 12) {
      hour += 12;
    }

    if (period === 'AM' && hour === 12) {
      hour = 0;
    }
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function getWorkingHoursWindowFromBusinessHours(value: string): WorkingHoursWindow {
  const [startText, endText] = value.split('-').map((part) => part.trim());
  const startTime = parseWorkingTimeInput(startText?.split(',').pop() ?? '');
  const endTime = parseWorkingTimeInput(endText ?? '');

  if (!startTime || !endTime || startTime >= endTime) {
    return fallbackWorkingHoursWindow;
  }

  return { endTime, startTime };
}
