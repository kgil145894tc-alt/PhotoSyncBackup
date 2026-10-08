import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getCalendarDaySummaries, getClientBookableSlotsForDate } from '@/services/calendar';

type CalendarResult<T> = { key: string; items: T[]; error: string | null };
const EMPTY_ITEMS: never[] = [];

// Share unfinished reads during effect replay; completed results are revalidated on focus.
function shareRead<T>(pending: Map<string, Promise<T[]>>, key: string, load: () => Promise<T[]>) {
  const existing = pending.get(key);
  if (existing) return existing;
  const request = Promise.resolve().then(load).finally(() => {
    if (pending.get(key) === request) pending.delete(key);
  });
  pending.set(key, request);
  return request;
}

function useFocusedCalendarRead<T>(key: string, load: (force?: boolean) => Promise<T[]>, errorMessage: string) {
  const [result, setResult] = useState<CalendarResult<T> | null>(null);
  const epoch = useRef(0);
  const activeKey = useRef<string | null>(null);
  const pending = useRef(new Map<string, Promise<T[]>>());

  useFocusEffect(useCallback(() => {
    activeKey.current = key;
    const version = ++epoch.current;
    void shareRead(pending.current, key, load).then((items) => {
      if (version === epoch.current) setResult({ key, items, error: null });
    }, () => {
      if (version === epoch.current) setResult({ key, items: [], error: errorMessage });
    });
    return () => { activeKey.current = null; epoch.current += 1; };
  }, [errorMessage, key, load]));

  const refresh = useCallback(async () => {
    if (activeKey.current !== key) return null;
    const version = ++epoch.current;
    try {
      // Confirmation must make a new server read, even if a presentation read is pending.
      const items = await load(true);
      if (version !== epoch.current) return null;
      setResult({ key, items, error: null });
      return items;
    } catch (error) {
      if (version === epoch.current) setResult({ key, items: [], error: errorMessage });
      throw error;
    }
  }, [errorMessage, key, load]);

  const retry = () => {
    if (activeKey.current !== key) return;
    setResult(null);
    void refresh().catch(() => {});
  };
  const current = result?.key === key ? result : null;
  return { items: current?.items ?? EMPTY_ITEMS, error: current?.error ?? null,
    isLoading: current === null, refresh, retry };
}

export function useClientBookingCalendar({ month, date, durationMinutes, bufferMinutes }: {
  month: string;
  date: string;
  durationMinutes: number;
  bufferMinutes: number;
}) {
  const loadMonth = useCallback(() => getCalendarDaySummaries(month, { throwOnError: true }), [month]);
  const loadSlots = useCallback((forceSettings = false) => getClientBookableSlotsForDate({
    date, durationMinutes, bufferMinutes, throwOnError: true, forceSettings,
  }), [bufferMinutes, date, durationMinutes]);
  const slotKey = `${date}:${durationMinutes}:${bufferMinutes}`;
  const summaries = useFocusedCalendarRead(month, loadMonth, 'Couldn’t load the calendar. Please try again.');
  const slots = useFocusedCalendarRead(slotKey, loadSlots, 'Couldn’t check availability. Please try again.');
  return { daySummaries: summaries.items, monthError: summaries.error, retryMonth: summaries.retry,
    timeSlots: slots.items, slotKey, slotsError: slots.error, isSlotsLoading: slots.isLoading,
    refreshSlots: slots.refresh, retrySlots: slots.retry };
}
