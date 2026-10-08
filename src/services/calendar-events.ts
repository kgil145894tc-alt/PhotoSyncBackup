type CalendarChangeListener = (date?: string) => void;
const listeners = new Set<CalendarChangeListener>();

// An omitted date means all cached dates may have changed (for example hours).
export function emitCalendarChanged(date?: string) {
  listeners.forEach((listener) => listener(date));
}

export function subscribeToCalendarChanged(listener: CalendarChangeListener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
