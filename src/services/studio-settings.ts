import { supabase } from '@/lib/supabase';
import { emitCalendarChanged, subscribeToCalendarChanged } from '@/services/calendar-events';
import { createAuthSessionScope } from '@/services/auth-session-scope';
import { createSessionReadCache, type SessionReadOptions } from '@/services/session-read-cache';

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
  id: boolean;
  business_hours: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  default_shoot_location: string | null;
  studio_address: string | null;
  studio_name: string | null;
};

const SETTINGS_COLUMNS = 'id, studio_name, studio_address, contact_phone, contact_email, default_shoot_location, business_hours';

export type StudioSettingsSaveResult =
  | { success: true; settings: StudioSettings }
  | { success: false; message: string };

const settingsReads = createSessionReadCache(async () => {
  if (!supabase) throw new Error('Studio settings are not connected yet.');
  const { data, error } = await supabase
    .from('studio_settings')
    .select(SETTINGS_COLUMNS)
    .eq('id', true)
    .maybeSingle();

  if (error) throw error;
  return data ? mapStudioSettingsRow(data as StudioSettingsRow) : fallbackStudioSettings;
}, { freshnessMs: 60_000, requireAccount: false });
const ensureSettingsScope = supabase ? createAuthSessionScope(supabase.auth, settingsReads.setAccount) : async () => {};
// Date-specific slot changes do not change the studio's singleton settings.
subscribeToCalendarChanged((date) => { if (!date) settingsReads.invalidate(); });

export async function getStudioSettings(options: SessionReadOptions & { throwOnError?: boolean } = {}): Promise<StudioSettings> {
  try {
    if (!supabase) throw new Error('Studio settings are not connected yet.');
    await ensureSettingsScope();
    return await settingsReads.read(options);
  } catch (error) {
    if (options.throwOnError) throw error;
    // Keep existing display fallbacks, but never cache a failed/default read.
    return fallbackStudioSettings;
  }
}

export async function getDefaultWorkingHoursWindow(options: SessionReadOptions & { throwOnError?: boolean } = {}): Promise<WorkingHoursWindow> {
  const settings = await getStudioSettings(options);

  return getWorkingHoursWindowFromBusinessHours(settings.businessHours);
}

export async function saveStudioSettings(values: StudioSettings): Promise<StudioSettingsSaveResult> {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  await ensureSettingsScope();
  const isSessionCurrent = settingsReads.captureSession();
  const businessHours = formatBusinessHours(values.workingStartTime, values.workingEndTime);
  const { data, error } = await supabase.from('studio_settings').upsert({
    business_hours: businessHours,
    contact_email: values.contactEmail.trim() || null,
    contact_phone: values.contactPhone.trim() || null,
    default_shoot_location: values.defaultShootLocation.trim() || null,
    id: true,
    studio_address: values.studioAddress.trim() || null,
    studio_name: values.studioName.trim() || 'PhotoSync Studio',
  }).select(SETTINGS_COLUMNS).single();

  if (error) {
    return { message: error.message, success: false };
  }

  if (!data || data.id !== true) {
    return { message: 'Studio settings were not saved. Please try again.', success: false };
  }

  const settings = mapStudioSettingsRow(data as StudioSettingsRow);
  if (!isSessionCurrent()) {
    return { message: 'Your session changed. Please sign in again.', success: false };
  }
  // Publish invalidation first; the confirmed row then supersedes any older read.
  emitCalendarChanged();
  settingsReads.accept(settings);
  return { success: true, settings };
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
  // The weekday prefix ("Mon-Sat,") contains its own hyphen. Only split the
  // time window, otherwise every saved value silently falls back to defaults.
  const timeWindow = value.slice(value.lastIndexOf(',') + 1);
  const [startText, endText] = timeWindow.split('-').map((part) => part.trim());
  const startTime = parseWorkingTimeInput(startText ?? '');
  const endTime = parseWorkingTimeInput(endText ?? '');

  if (!startTime || !endTime || startTime >= endTime) {
    return fallbackWorkingHoursWindow;
  }

  return { endTime, startTime };
}
