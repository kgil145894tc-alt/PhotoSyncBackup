import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';

// Update date-dependent controls while this screen is open, including after midnight/resume.
export function useStudioCalendarClock() {
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => {
    let active = true;
    const update = () => { if (active) setNow(new Date()); };
    update();
    const timer = setInterval(update, 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, []));
  return now;
}
